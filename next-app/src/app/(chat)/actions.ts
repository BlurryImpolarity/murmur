"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
    conversationsTable,
    MessageDirections,
    messagesTable,
    MessageStatuses,
    MessageTypes,
    StickerCollectionKinds,
    stickersTable,
} from "@murmur/db";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const MAX_TEXT_LENGTH = 4096; // telegram limit

// Queues a text message; the bot picks up `pending` messages and delivers them
export async function sendTextMessage(conversationId: string, text: string) {
    await requireAdmin();

    const body = text.trim();
    if (!body) return;
    if (body.length > MAX_TEXT_LENGTH) throw new Error(`Message is longer than ${MAX_TEXT_LENGTH} characters`);

    await db.insert(messagesTable).values({
        conversationId,
        direction: MessageDirections.outgoing,
        type: MessageTypes.text,
        text: body,
        status: MessageStatuses.pending,
    });
    await db
        .update(conversationsTable)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conversationId));

    revalidatePath("/", "layout");
}

export type StickerCollection = {
    id: string;
    title: string;
    stickers: {
        id: string;
        fileId: string;
        mimeType: string;
        thumbnailFileId: string | null;
        emoji: string | null;
    }[];
};

// Saved stickers for the composer picker: custom collections (favorites first), then packs
export async function listStickerCollections(): Promise<StickerCollection[]> {
    await requireAdmin();

    const collections = await db.query.stickerCollectionsTable.findMany({
        columns: { id: true, kind: true, name: true, title: true },
        with: {
            stickers: {
                columns: { id: true, fileId: true, mimeType: true, thumbnailFileId: true, emoji: true },
                orderBy: (sticker, { asc }) => [asc(sticker.position), asc(sticker.createdAt)],
            },
        },
    });

    const rank = (c: (typeof collections)[number]) =>
        c.kind === StickerCollectionKinds.custom ? (c.name === "favorites" ? 0 : 1) : 2;
    return collections
        .filter((collection) => collection.stickers.length > 0)
        .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
        .map(({ id, title, stickers }) => ({ id, title, stickers }));
}

// Queues a saved sticker as an outgoing message
export async function sendSticker(conversationId: string, stickerId: string) {
    await requireAdmin();

    const sticker = await db.query.stickersTable.findFirst({ where: eq(stickersTable.id, stickerId) });
    if (!sticker) throw new Error("Sticker not found");

    await db.insert(messagesTable).values({
        conversationId,
        direction: MessageDirections.outgoing,
        type: MessageTypes.sticker,
        fileId: sticker.fileId,
        fileUniqueId: sticker.fileUniqueId,
        mimeType: sticker.mimeType,
        stickerEmoji: sticker.emoji,
        status: MessageStatuses.pending,
    });
    await db
        .update(conversationsTable)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conversationId));

    revalidatePath("/", "layout");
}
