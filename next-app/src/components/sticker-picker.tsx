"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sticker } from "@/components/sticker";
import { listStickerCollections, type StickerCollection } from "@/app/(chat)/actions";
import { fileUrl } from "@/lib/format";

// kept between openings; refreshed in the background on every open (stickers are added via the bot)
let cache: StickerCollection[] | null = null;

export function StickerPicker({ onSelect }: { onSelect: (stickerId: string) => void }) {
    const [collections, setCollections] = useState(cache);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listStickerCollections()
            .then((result) => {
                cache = result;
                setCollections(result);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stickers"));
    }, []);

    if (!collections) {
        return <Placeholder>{error ?? "Loading stickers…"}</Placeholder>;
    }
    if (!collections.length) {
        return <Placeholder>No saved stickers yet. Add some with /addpack or /addsticker in the bot.</Placeholder>;
    }

    const active = collections.find((collection) => collection.id === activeId) ?? collections[0];

    return (
        <div className="flex flex-col border-b">
            <div className="flex gap-1 overflow-x-auto p-2">
                {collections.map((collection) => (
                    <Button
                        key={collection.id}
                        type="button"
                        size="sm"
                        variant={collection.id === active.id ? "secondary" : "ghost"}
                        className="shrink-0"
                        onClick={() => setActiveId(collection.id)}
                    >
                        {collection.title}
                    </Button>
                ))}
            </div>
            <div className="grid max-h-64 grid-cols-5 gap-1 overflow-y-auto px-2 pb-2 sm:grid-cols-7 md:grid-cols-8">
                {active.stickers.map((sticker) => (
                    <button
                        key={sticker.id}
                        type="button"
                        title={sticker.emoji ?? undefined}
                        // keep focus in the textarea so the mobile keyboard doesn't jump
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => onSelect(sticker.id)}
                        className="aspect-square rounded-md p-1 transition-colors hover:bg-muted"
                    >
                        {sticker.thumbnailFileId ? (
                            <img
                                src={fileUrl(sticker.thumbnailFileId)}
                                alt={sticker.emoji ?? "sticker"}
                                loading="lazy"
                                className="size-full object-contain"
                            />
                        ) : (
                            // stickers saved before thumbnails were stored
                            <Sticker
                                src={fileUrl(sticker.fileId)}
                                emoji={sticker.emoji}
                                mimeType={sticker.mimeType}
                                className="size-full"
                            />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Placeholder({ children }: { children: React.ReactNode }) {
    return <p className="border-b p-4 text-center text-xs text-muted-foreground">{children}</p>;
}
