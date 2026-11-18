import { getAdmin } from "@/lib/auth";

const CONTENT_TYPES: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    oga: "audio/ogg",
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    pdf: "application/pdf",
    tgs: "application/x-tgsticker",
};

// Telegram doesn't always give files an extension (e.g. animated stickers are "stickers/file_2"),
// so the type is sniffed from the first bytes as a fallback
function sniffContentType(bytes: Uint8Array): string | undefined {
    const at = (offset: number, ...signature: number[]) => signature.every((byte, i) => bytes[offset + i] === byte);
    if (at(0, 0x1f, 0x8b)) return "application/x-tgsticker"; // gzip: telegram serves it only for .tgs stickers
    if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
    if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
    if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
    if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
    if (at(0, 0x4f, 0x67, 0x67, 0x53)) return "audio/ogg";
    if (at(4, 0x66, 0x74, 0x79, 0x70)) return "video/mp4";
    return undefined;
}

// Proxies telegram files (avatars, media, stickers) so the bot token never reaches the browser.
// Bot API can only download files up to 20 MB.
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
    if (!(await getAdmin())) return new Response(null, { status: 401 });

    const { fileId } = await params;
    const api = `https://api.telegram.org`;
    const token = process.env.BOT_TOKEN;

    const meta = await fetch(`${api}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then((res) =>
        res.json()
    );
    if (!meta.ok) return new Response(meta.description ?? "File not found", { status: 404 });

    const filePath: string = meta.result.file_path;
    const range = request.headers.get("range");
    const file = await fetch(`${api}/file/bot${token}/${filePath}`, { headers: range ? { range } : {} });
    if (!file.ok || !file.body) return new Response("Failed to fetch file", { status: 502 });

    const extension = filePath.includes(".") ? filePath.split(".").pop()!.toLowerCase() : "";
    let contentType: string | undefined = CONTENT_TYPES[extension];
    let body: ReadableStream<Uint8Array> = file.body;

    // no known extension: peek at the first chunk (only meaningful for a full, non-range response)
    if (!contentType && file.status === 200) {
        const reader = file.body.getReader();
        const first = await reader.read();
        if (!first.done) contentType = sniffContentType(first.value);
        body = new ReadableStream({
            start(controller) {
                if (first.done) controller.close();
                else controller.enqueue(first.value);
            },
            async pull(controller) {
                const { done, value } = await reader.read();
                if (done) controller.close();
                else controller.enqueue(value);
            },
            cancel: (reason) => reader.cancel(reason),
        });
    }

    const headers = new Headers({
        "Content-Type": contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
    });
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
        const value = file.headers.get(name);
        if (value) headers.set(name, value);
    }
    const download = new URL(request.url).searchParams.get("download");
    if (download) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download)}`);

    return new Response(body, { status: file.status, headers });
}
