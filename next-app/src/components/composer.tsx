"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SendIcon, StickerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MediaPicker, type PickedMedia } from "@/components/media-picker";
import { sendGif, sendSticker, sendTextMessage } from "@/app/(chat)/actions";

// Uncontrolled textarea: the value is read from the DOM on submit, so sending doesn't depend on React state.
// `empty` only drives the button's disabled look and is re-synced from the DOM on mount and every input.
export function Composer({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [empty, setEmpty] = useState(true);
    const [stickersOpen, setStickersOpen] = useState(false);
    const syncEmpty = () => setEmpty(!textarea.current?.value.trim());

    // picks up text typed before hydration
    useEffect(syncEmpty, []);
    const [, startTransition] = useTransition();

    const submit = () => {
        const element = textarea.current;
        const value = element?.value.trim();
        if (!element || !value) return;

        // clear right away so the next message can be typed while this one is being queued;
        // next.js runs server actions sequentially, so order is preserved
        element.value = "";
        setEmpty(true);
        setError(null);
        startTransition(async () => {
            try {
                await sendTextMessage(conversationId, value);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to send");
                if (!element.value) element.value = value;
                syncEmpty();
            }
        });
    };

    const submitMedia = (media: PickedMedia) => {
        setError(null);
        startTransition(async () => {
            try {
                if (media.kind === "gif") await sendGif(conversationId, media.id);
                else await sendSticker(conversationId, media.id);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to send");
            }
        });
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
            className="shrink-0 border-t"
        >
            {stickersOpen && !disabled && <MediaPicker onSelect={submitMedia} />}
            {error && <p className="px-3 pt-2 text-xs text-destructive">{error}</p>}
            <div className="flex items-end gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <Button
                    type="button"
                    size="icon-lg"
                    variant={stickersOpen ? "secondary" : "ghost"}
                    disabled={disabled}
                    aria-label="Stickers and GIFs"
                    aria-pressed={stickersOpen}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => setStickersOpen((open) => !open)}
                >
                    <StickerIcon />
                </Button>
                <Textarea
                    ref={textarea}
                    onInput={syncEmpty}
                    onKeyDown={(event) => {
                        // Enter sends on desktop; on touch devices Enter inserts a newline
                        const finePointer = window.matchMedia("(pointer: fine)").matches;
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && finePointer) {
                            event.preventDefault();
                            submit();
                        }
                    }}
                    placeholder={disabled ? "Conversation is blocked" : "Message"}
                    disabled={disabled}
                    rows={1}
                    className="max-h-40 min-h-9"
                />
                <Button
                    type="submit"
                    size="icon-lg"
                    disabled={disabled || empty}
                    aria-label="Send"
                    // keep focus in the textarea so the mobile keyboard stays open
                    onPointerDown={(event) => event.preventDefault()}
                >
                    <SendIcon />
                </Button>
            </div>
        </form>
    );
}
