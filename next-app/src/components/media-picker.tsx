"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sticker } from "@/components/sticker";
import { listPickerMedia, type SavedGif, type StickerCollection } from "@/app/(chat)/actions";
import { fileUrl } from "@/lib/format";

export type PickedMedia = { kind: "sticker" | "gif"; id: string };
type Media = Awaited<ReturnType<typeof listPickerMedia>>;

const GIFS_TAB = "gifs";

// kept between openings; refreshed in the background on every open (stickers and GIFs are added via the bot)
let cache: Media | null = null;

export function MediaPicker({ onSelect }: { onSelect: (media: PickedMedia) => void }) {
    const [media, setMedia] = useState(cache);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listPickerMedia()
            .then((result) => {
                cache = result;
                setMedia(result);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stickers and GIFs"));
    }, []);

    if (!media) {
        return <Placeholder>{error ?? "Loading…"}</Placeholder>;
    }
    const tabs = [
        ...(media.gifs.length ? [{ id: GIFS_TAB, title: "GIFs" }] : []),
        ...media.stickerCollections.map(({ id, title }) => ({ id, title })),
    ];
    if (!tabs.length) {
        return (
            <Placeholder>
                Nothing saved yet. Add stickers with /addpack or /addsticker and GIFs with /addgif in the bot.
            </Placeholder>
        );
    }

    const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
    const collection = media.stickerCollections.find((c) => c.id === active.id);

    return (
        <div className="flex flex-col border-b">
            <div className="flex gap-1 overflow-x-auto p-2">
                {tabs.map((tab) => (
                    <Button
                        key={tab.id}
                        type="button"
                        size="sm"
                        variant={tab.id === active.id ? "secondary" : "ghost"}
                        className="shrink-0"
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.title}
                    </Button>
                ))}
            </div>
            {active.id === GIFS_TAB ? (
                <GifGrid gifs={media.gifs} onSelect={(id) => onSelect({ kind: "gif", id })} />
            ) : (
                collection && (
                    <StickerGrid collection={collection} onSelect={(id) => onSelect({ kind: "sticker", id })} />
                )
            )}
        </div>
    );
}

// keeps focus in the textarea so the mobile keyboard doesn't jump
const keepFocus = (event: React.PointerEvent) => event.preventDefault();

function StickerGrid({ collection, onSelect }: { collection: StickerCollection; onSelect: (id: string) => void }) {
    return (
        <div className="grid max-h-64 grid-cols-5 gap-1 overflow-y-auto px-2 pb-2 sm:grid-cols-7 md:grid-cols-8">
            {collection.stickers.map((sticker) => (
                <button
                    key={sticker.id}
                    type="button"
                    title={sticker.emoji ?? undefined}
                    onPointerDown={keepFocus}
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
    );
}

function GifGrid({ gifs, onSelect }: { gifs: SavedGif[]; onSelect: (id: string) => void }) {
    return (
        <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto px-2 pb-2 sm:grid-cols-3 md:grid-cols-4">
            {gifs.map((gif) => (
                <button
                    key={gif.id}
                    type="button"
                    onPointerDown={keepFocus}
                    onClick={() => onSelect(gif.id)}
                    className="aspect-video overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-80"
                >
                    {gif.thumbnailFileId ? (
                        <img
                            src={fileUrl(gif.thumbnailFileId)}
                            alt="GIF"
                            loading="lazy"
                            className="size-full object-cover"
                        />
                    ) : (
                        <video
                            src={fileUrl(gif.fileId)}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="size-full object-cover"
                        />
                    )}
                </button>
            ))}
        </div>
    );
}

function Placeholder({ children }: { children: React.ReactNode }) {
    return <p className="border-b p-4 text-center text-xs text-muted-foreground">{children}</p>;
}
