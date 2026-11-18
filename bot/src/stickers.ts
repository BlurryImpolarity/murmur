import { Composer } from "telegraf-hardened";
import type { Sticker } from "telegraf-hardened/types";
import { StickerCollectionKinds, stickerCollectionsTable, stickersTable } from "@murmur/db";
import { count, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { clearPending, getPending, setPending } from "./pending";
import { stickerMimeType } from "./sticker-format";
import type { BotContext } from "./context";

// Admin commands to save stickers for later use:
//   /addpack [name|t.me/addstickers/link]  - imports the whole pack (or of the next sticker sent); re-adding refreshes it
//   /addsticker [collection]               - saves the next sticker to a custom collection (default: uncategorized)
//   /stickers                              - lists saved packs and collections

const DEFAULT_COLLECTION = "uncategorized";
const COLLECTION_ALIASES: Record<string, string> = {
    fav: "favorites",
    favs: "favorites",
    favorite: "favorites",
    favourites: "favorites",
};
const COLLECTION_TITLES: Record<string, string> = {
    favorites: "Favorites",
    uncategorized: "Uncategorized",
};

export const stickers = new Composer<BotContext>();

stickers.command("addpack", async (ctx) => {
    const arg = ctx.payload.trim();
    if (!arg) {
        setPending(ctx.from.id, { kind: "addPack" });
        return ctx.reply("Send a sticker from the pack or /cancel to abort");
    }
    const name = parseSetName(arg);
    if (!name) return ctx.reply("Usage: /addpack [pack name or t.me/addstickers/... link]");
    await importPack(ctx, name);
});

stickers.command("addsticker", async (ctx) => {
    const collection = normalizeCollection(ctx.payload);
    if (!collection) return ctx.reply("Collection name can only contain letters, digits, _ and -");
    setPending(ctx.from.id, { kind: "addSticker", collection });
    await ctx.reply(`Send a sticker to add to "${collectionTitle(collection)}" or /cancel to abort`);
});

stickers.command("stickers", async (ctx) => {
    const rows = await db
        .select({
            kind: stickerCollectionsTable.kind,
            name: stickerCollectionsTable.name,
            title: stickerCollectionsTable.title,
            stickers: count(stickersTable.id),
        })
        .from(stickerCollectionsTable)
        .leftJoin(stickersTable, eq(stickersTable.collectionId, stickerCollectionsTable.id))
        .groupBy(stickerCollectionsTable.id)
        .orderBy(stickerCollectionsTable.kind, stickerCollectionsTable.title);
    if (!rows.length) return ctx.reply("No stickers saved yet. Use /addpack or /addsticker");

    const section = (kind: string, heading: string) => {
        const items = rows.filter((row) => row.kind === kind);
        return items.length
            ? [heading, ...items.map((row) => `• ${row.title} (${row.name}): ${row.stickers}`)].join("\n")
            : null;
    };
    await ctx.reply(
        [section(StickerCollectionKinds.custom, "Collections:"), section(StickerCollectionKinds.pack, "Packs:")]
            .filter(Boolean)
            .join("\n\n")
    );
});

// second step of /addpack and /addsticker
stickers.on("message", async (ctx, next) => {
    const action = getPending(ctx.from.id);
    if (action?.kind !== "addPack" && action?.kind !== "addSticker") return next();

    if (!("sticker" in ctx.message)) {
        // commands go through, anything else is a mistake
        if ("text" in ctx.message && ctx.message.text.startsWith("/")) return next();
        return ctx.reply("That's not a sticker. Send a sticker or /cancel to abort");
    }
    clearPending(ctx.from.id);
    const sticker = ctx.message.sticker;

    if (action.kind === "addPack") {
        if (!sticker.set_name) return ctx.reply("This sticker isn't part of a pack");
        return importPack(ctx, sticker.set_name);
    }
    await addSticker(ctx, action.collection, sticker);
});

async function importPack(ctx: BotContext, name: string) {
    let set;
    try {
        set = await ctx.telegram.getStickerSet(name);
    } catch {
        return ctx.reply(`Pack "${name}" not found`);
    }
    if (set.sticker_type !== "regular") return ctx.reply("Only regular sticker packs are supported");

    // replace the pack's stickers, so re-adding refreshes order and removed/added stickers
    await db.transaction(async (tx) => {
        const [collection] = await tx
            .insert(stickerCollectionsTable)
            .values({ kind: StickerCollectionKinds.pack, name: set.name, title: set.title })
            .onConflictDoUpdate({
                target: [stickerCollectionsTable.kind, stickerCollectionsTable.name],
                set: { title: set.title, updatedAt: new Date() },
            })
            .returning();
        await tx.delete(stickersTable).where(eq(stickersTable.collectionId, collection.id));
        if (set.stickers.length) {
            await tx.insert(stickersTable).values(
                set.stickers.map((sticker, position) => ({
                    collectionId: collection.id,
                    ...stickerValues(sticker),
                    position,
                }))
            );
        }
    });
    await ctx.reply(`Pack "${set.title}" saved: ${set.stickers.length} stickers`);
}

async function addSticker(ctx: BotContext, name: string, sticker: Sticker) {
    const title = collectionTitle(name);
    const [collection] = await db
        .insert(stickerCollectionsTable)
        .values({ kind: StickerCollectionKinds.custom, name, title })
        .onConflictDoUpdate({
            target: [stickerCollectionsTable.kind, stickerCollectionsTable.name],
            set: { updatedAt: new Date() },
        })
        .returning();

    const [{ position }] = await db
        .select({ position: sql<number>`coalesce(max(${stickersTable.position}) + 1, 0)::int` })
        .from(stickersTable)
        .where(eq(stickersTable.collectionId, collection.id));
    const inserted = await db
        .insert(stickersTable)
        .values({ collectionId: collection.id, ...stickerValues(sticker), position })
        .onConflictDoNothing()
        .returning({ id: stickersTable.id });

    await ctx.reply(inserted.length ? `Added to "${collection.title}"` : `Already in "${collection.title}"`);
}

function stickerValues(sticker: Sticker) {
    return {
        fileId: sticker.file_id,
        fileUniqueId: sticker.file_unique_id,
        mimeType: stickerMimeType(sticker),
        thumbnailFileId: sticker.thumbnail?.file_id ?? null,
        emoji: sticker.emoji ?? null,
        setName: sticker.set_name ?? null,
    };
}

// "Name", "t.me/addstickers/Name" or "https://t.me/addstickers/Name"
function parseSetName(arg: string): string | null {
    const name = arg.replace(/^(https?:\/\/)?(t|telegram)\.me\/addstickers\//i, "").replace(/[/?#].*$/, "");
    return /^[A-Za-z0-9_]{1,64}$/.test(name) ? name : null;
}

function normalizeCollection(arg: string): string | null {
    const name = arg.trim().toLowerCase() || DEFAULT_COLLECTION;
    const resolved = COLLECTION_ALIASES[name] ?? name;
    return /^[a-z0-9_-]{1,64}$/.test(resolved) ? resolved : null;
}

function collectionTitle(name: string): string {
    return COLLECTION_TITLES[name] ?? name;
}
