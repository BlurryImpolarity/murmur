"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ReplyIcon, SendIcon, StickerIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MediaPicker, type PickedMedia } from "@/components/media-picker";
import { useReply } from "@/components/reply-context";
import { sendGif, sendSticker, sendTextMessage } from "@/app/(chat)/actions";

// Uncontrolled textarea: the value is read from the DOM on submit, so sending doesn't depend on React state.
// `empty` only drives the button's disabled look and is re-synced from the DOM on mount and every input.
export function Composer({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [empty, setEmpty] = useState(true);
    const [stickersOpen, setStickersOpen] = useState(false);
    const { target: replyTarget, setTarget: setReplyTarget } = useReply();
    const syncEmpty = () => setEmpty(!textarea.current?.value.trim());

    // jump into the input as soon as a message is picked to reply to
    useEffect(() => {
        if (replyTarget) textarea.current?.focus();
    }, [replyTarget]);

    // picks up text typed before hydration
    useEffect(syncEmpty, []);
    const [, startTransition] = useTransition();

    const submit = () => {
        const element = textarea.current;
        const value = element?.value.trim();
        if (!element || !value) return;

        // clear right away so the next message can be typed while this one is being queued;
        // next.js runs server actions sequentially, so order is preserved
        const replyTo = replyTarget;
        element.value = "";
        setEmpty(true);
        setError(null);
        setReplyTarget(null);
        startTransition(async () => {
            try {
                await sendTextMessage(conversationId, value, replyTo?.id);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to send");
                if (!element.value) {
                    element.value = value;
                    setReplyTarget(replyTo);
                }
                syncEmpty();
            }
        });
    };

    const submitMedia = (media: PickedMedia) => {
        const replyTo = replyTarget;
        setError(null);
        setReplyTarget(null);
        startTransition(async () => {
            try {
                if (media.kind === "gif") await sendGif(conversationId, media.id, replyTo?.id);
                else await sendSticker(conversationId, media.id, replyTo?.id);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to send");
                setReplyTarget(replyTo);
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
            {replyTarget && !disabled && (
                <div className="flex items-center gap-2 px-3 pt-2">
                    <ReplyIcon className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1 border-l-2 border-primary pl-2 text-xs">
                        <div className="font-medium text-primary">Reply to {replyTarget.author}</div>
                        <div className="truncate text-muted-foreground">{replyTarget.preview}</div>
                    </div>
                    <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Cancel reply"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => setReplyTarget(null)}
                    >
                        <XIcon />
                    </Button>
                </div>
            )}
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
                        if (event.key === "Escape" && replyTarget) {
                            event.preventDefault();
                            setReplyTarget(null);
                            return;
                        }
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
