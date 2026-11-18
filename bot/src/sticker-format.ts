// Mime type stored for stickers, lets the web app pick img / video / lottie
export function stickerMimeType(sticker: { is_animated: boolean; is_video: boolean }): string {
    if (sticker.is_video) return "video/webm";
    if (sticker.is_animated) return "application/x-tgsticker";
    return "image/webp";
}
