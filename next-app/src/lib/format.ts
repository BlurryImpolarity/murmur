import type { ConversationsTable, MessagesTable } from "@murmur/db";

type Conversation = Pick<ConversationsTable["$inferSelect"], "firstName" | "lastName">;
type Message = Pick<MessagesTable["$inferSelect"], "type" | "mediaKind" | "text" | "fileName" | "stickerEmoji">;

export function displayName(conversation: Conversation): string {
    return [conversation.firstName, conversation.lastName].filter(Boolean).join(" ");
}

export function initials(conversation: Conversation): string {
    return [conversation.firstName, conversation.lastName]
        .filter(Boolean)
        .map((part) => part!.charAt(0).toUpperCase())
        .join("");
}

const mediaLabels: Record<string, string> = {
    photo: "Photo",
    video: "Video",
    animation: "GIF",
    audio: "Audio",
    voice: "Voice message",
    video_note: "Video message",
    document: "File",
};

// one-line summary for lists and reply quotes
export function messagePreview(message: Message): string {
    if (message.type === "sticker") return `${message.stickerEmoji ?? ""} Sticker`.trim();
    if (message.type === "media") {
        const label =
            message.mediaKind === "document" && message.fileName
                ? message.fileName
                : mediaLabels[message.mediaKind ?? ""];
        return message.text ? `${label}: ${message.text}` : (label ?? "Media");
    }
    return message.text ?? "";
}

export function formatFileSize(bytes: number | null): string | null {
    if (bytes == null) return null;
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function fileUrl(fileId: string, downloadName?: string | null): string {
    const url = `/api/files/${encodeURIComponent(fileId)}`;
    return downloadName ? `${url}?download=${encodeURIComponent(downloadName)}` : url;
}
