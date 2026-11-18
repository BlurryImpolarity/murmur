import { FileIcon } from "lucide-react";
import type { MessagesTable } from "@murmur/db";
import { Sticker } from "@/components/sticker";
import { fileUrl, formatFileSize } from "@/lib/format";

type Message = MessagesTable["$inferSelect"];

// media rendered edge-to-edge without bubble padding
export function isVisualMedia(message: Message): boolean {
    if (message.type === "sticker") return true;
    return message.type === "media" && ["photo", "video", "animation", "video_note"].includes(message.mediaKind ?? "");
}

// stickers and round videos are shown without a bubble, like in telegram
export function isBubbleless(message: Message): boolean {
    return message.type === "sticker" || message.mediaKind === "video_note";
}

export function MessageMedia({ message }: { message: Message }) {
    if (!message.fileId) return null;
    const src = fileUrl(message.fileId);

    if (message.type === "sticker") return <Sticker src={src} emoji={message.stickerEmoji} />;

    switch (message.mediaKind) {
        case "photo":
            return <img src={src} alt="" loading="lazy" className="block h-auto max-h-96 max-w-full min-h-8" />;
        case "video":
            return (
                <video
                    src={src}
                    controls
                    playsInline
                    preload="metadata"
                    className="block max-h-96 max-w-full min-h-8"
                />
            );
        case "animation":
            return <video src={src} autoPlay loop muted playsInline className="block max-h-96 max-w-full min-h-8" />;
        case "video_note":
            return (
                <video
                    src={src}
                    controls
                    playsInline
                    preload="metadata"
                    className="block size-56 rounded-full object-cover"
                />
            );
        case "voice":
            return <audio src={src} controls preload="metadata" className="w-64 max-w-full min-h-8" />;
        case "audio":
            return (
                <div className="flex flex-col gap-1">
                    {message.fileName && <span className="truncate text-xs">{message.fileName}</span>}
                    <audio src={src} controls preload="metadata" className="w-64 max-w-full min-h-8" />
                </div>
            );
        default: {
            const size = formatFileSize(message.fileSize);
            return (
                <a
                    href={fileUrl(message.fileId, message.fileName ?? "file")}
                    className="flex items-center gap-2 min-h-8"
                >
                    <FileIcon className="size-8 shrink-0 opacity-70" />
                    <span className="min-w-0">
                        <span className="block truncate text-sm underline-offset-2 hover:underline min-h-8">
                            {message.fileName ?? "File"}
                        </span>
                        {size && <span className="text-xs opacity-70">{size}</span>}
                    </span>
                </a>
            );
        }
    }
}
