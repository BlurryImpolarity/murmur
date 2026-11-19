import { AlertCircleIcon, CheckIcon, ClockIcon } from "lucide-react";
import type { MessagesTable } from "@murmur/db";
import { FormattedText } from "@/components/formatted-text";
import { isBubbleless, isVisualMedia, MessageMedia } from "@/components/message-media";
import { Replyable } from "@/components/reply-context";
import { Time } from "@/components/time";
import { messagePreview } from "@/lib/format";
import { cn } from "@/lib/utils";

type Message = MessagesTable["$inferSelect"] & { replyTo: MessagesTable["$inferSelect"] | null };

// `contactName` labels incoming messages in reply previews
export function MessageBubble({ message, contactName }: { message: Message; contactName: string }) {
    const outgoing = message.direction === "outgoing";
    const visual = isVisualMedia(message);
    const bubbleless = isBubbleless(message);

    const meta = (
        <>
            <Time date={message.sentAt ?? message.createdAt} />
            {outgoing && <StatusIcon status={message.status} />}
        </>
    );
    const quote = message.replyTo && (
        <a
            href={`#${anchorId(message.replyTo.id)}`}
            className="block truncate border-l-2 border-current/40 pl-2 text-xs opacity-80 hover:opacity-100"
        >
            {messagePreview(message.replyTo)}
        </a>
    );
    // only delivered messages have a telegram message id to reply to
    const replyTarget = message.telegramMessageId
        ? { id: message.id, author: outgoing ? "yourself" : contactName, preview: messagePreview(message) }
        : null;
    const caption = message.text && (
        <div className="flex flex-col gap-1">
            <FormattedText text={message.text} entities={message.entities} />
            <div className="flex items-center justify-end gap-1 text-xs opacity-70">{meta}</div>
        </div>
    );

    return (
        <div
            id={anchorId(message.id)}
            className={cn(
                "flex scroll-my-4 flex-col rounded-lg transition-colors target:bg-primary/10",
                outgoing ? "items-end" : "items-start"
            )}
        >
            <Replyable target={replyTarget} outgoing={outgoing}>
                {visual ? (
                    <div
                        className={cn(
                            "flex max-w-[85%] flex-col overflow-hidden text-sm md:max-w-[70%]",
                            !bubbleless && "min-w-48 rounded-lg",
                            !bubbleless && bubbleColors(outgoing)
                        )}
                    >
                        {quote && <div className="px-3 pt-2 pb-1.5">{quote}</div>}
                        <div className="relative">
                            <MessageMedia message={message} />
                            {!message.text && (
                                <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-background/80 px-1.5 py-0.5 text-xs text-foreground">
                                    {meta}
                                </div>
                            )}
                        </div>
                        {/* w-0 min-w-full: caption wraps to the media width instead of widening the bubble */}
                        {caption && <div className="w-0 min-w-full px-3 py-2">{caption}</div>}
                    </div>
                ) : (
                    <div
                        className={cn(
                            "flex max-w-[85%] flex-col gap-1 rounded-lg px-3 py-2 text-sm md:max-w-[70%]",
                            bubbleColors(outgoing)
                        )}
                    >
                        {quote}
                        <MessageMedia message={message} />
                        {caption || (
                            <div className="flex items-center justify-end gap-1 text-xs opacity-70">{meta}</div>
                        )}
                    </div>
                )}
            </Replyable>
            {message.status === "failed" && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircleIcon className="size-3" />
                    {message.error ?? "Failed to send"}
                </p>
            )}
        </div>
    );
}

function anchorId(messageId: string): string {
    return `m-${messageId}`;
}

function bubbleColors(outgoing: boolean): string {
    return outgoing ? "bg-primary text-primary-foreground" : "bg-muted";
}

function StatusIcon({ status }: { status: Message["status"] }) {
    if (status === "sent") return <CheckIcon className="size-3" aria-label="sent" />;
    if (status === "failed") return <AlertCircleIcon className="size-3" aria-label="failed" />;
    return <ClockIcon className="size-3" aria-label={status ?? undefined} />;
}
