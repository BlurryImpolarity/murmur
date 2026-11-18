"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Loaded = { kind: "image" | "video"; url: string } | { kind: "lottie" };

// Sticker format (webp / webm / tgs) is detected from the served file, so stickers saved without a mime type work too
export function Sticker({ src, emoji, className }: { src: string; emoji?: string | null; className?: string }) {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [failed, setFailed] = useState(false);
    const lottieContainer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | undefined;
        let destroyAnimation: (() => void) | undefined;

        (async () => {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const type = response.headers.get("content-type") ?? "";

            if (type === "application/x-tgsticker") {
                // animated stickers are gzipped lottie json
                const [{ default: lottie }, animationData] = await Promise.all([
                    import("lottie-web/build/player/lottie_light"),
                    new Response(response.body!.pipeThrough(new DecompressionStream("gzip"))).json(),
                ]);
                if (cancelled) return;
                setLoaded({ kind: "lottie" });
                // container renders after state update
                await new Promise(requestAnimationFrame);
                if (cancelled || !lottieContainer.current) return;
                const animation = lottie.loadAnimation({
                    container: lottieContainer.current,
                    renderer: "svg",
                    loop: true,
                    autoplay: true,
                    animationData,
                });
                destroyAnimation = () => animation.destroy();
                return;
            }

            objectUrl = URL.createObjectURL(await response.blob());
            if (cancelled) return URL.revokeObjectURL(objectUrl);
            setLoaded({ kind: type.startsWith("video/") ? "video" : "image", url: objectUrl });
        })().catch(() => !cancelled && setFailed(true));

        return () => {
            cancelled = true;
            destroyAnimation?.();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src]);

    const title = emoji ?? undefined;
    const classes = cn("block size-36 object-contain", className);

    if (failed || !loaded) {
        return (
            <div title={title} className={cn(classes, "flex items-center justify-center text-5xl")}>
                {failed ? (emoji ?? "🖼️") : null}
            </div>
        );
    }
    if (loaded.kind === "lottie") return <div ref={lottieContainer} title={title} className={classes} />;
    if (loaded.kind === "video") {
        return <video src={loaded.url} title={title} autoPlay loop muted playsInline className={classes} />;
    }
    return <img src={loaded.url} title={title} alt={title ?? "sticker"} className={classes} />;
}
