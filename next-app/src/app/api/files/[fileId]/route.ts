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

    const headers = new Headers({
        "Content-Type": CONTENT_TYPES[filePath.split(".").pop()!.toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
    });
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
        const value = file.headers.get(name);
        if (value) headers.set(name, value);
    }
    const download = new URL(request.url).searchParams.get("download");
    if (download) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download)}`);

    return new Response(file.body, { status: file.status, headers });
}
