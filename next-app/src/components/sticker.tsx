"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TGS = "application/x-tgsticker";

type Loaded = { kind: "image" | "video"; url: string } | { kind: "lottie"; animationData: unknown };

type Props = {
    src: string;
    emoji?: string | null;
    // stored format, when known; otherwise taken from the served file's content type
    mimeType?: string | null;
    className?: string;
};

export function Sticker({ src, emoji, mimeType, className }: Props) {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [failed, setFailed] = useState(false);
    const lottieContainer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | undefined;

        (async () => {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const type = mimeType || response.headers.get("content-type") || "";

            if (type === TGS) {
                // animated stickers are gzipped lottie json
                const animationData = await new Response(
                    response.body!.pipeThrough(new DecompressionStream("gzip"))
                ).json();
                if (!cancelled) setLoaded({ kind: "lottie", animationData });
                return;
            }

            objectUrl = URL.createObjectURL(await response.blob());
            if (cancelled) return URL.revokeObjectURL(objectUrl);
            setLoaded({ kind: type.startsWith("video/") ? "video" : "image", url: objectUrl });
        })().catch(() => !cancelled && setFailed(true));

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src, mimeType]);

    // runs after the lottie container is committed, so the ref is always set here
    const animationData = loaded?.kind === "lottie" ? loaded.animationData : null;
    useEffect(() => {
        if (!animationData || !lottieContainer.current) return;
        const container = lottieContainer.current;
        let destroy: (() => void) | undefined;
        let cancelled = false;

        import("lottie-web/build/player/lottie_light")
            .then(({ default: lottie }) => {
                if (cancelled) return;
                const animation = lottie.loadAnimation({
                    container,
                    renderer: "svg",
                    loop: true,
                    autoplay: true,
                    animationData,
                });
                destroy = () => animation.destroy();
            })
            .catch(() => !cancelled && setFailed(true));

        return () => {
            cancelled = true;
            destroy?.();
        };
    }, [animationData]);

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
