import { Composer } from "telegraf-hardened";
import type { Sticker } from "telegraf-hardened/types";
import { StickerCollectionKinds, stickerCollectionsTable, stickersTable } from "@murmur/db";
import { and, count, eq, inArray, notExists, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { clearPending, getPending, setPending } from "./pending";
import { stickerMimeType } from "./sticker-format";
import type { BotContext } from "./context";

// Admin commands to save stickers for later use:
//   /addpack [name|t.me/addstickers/link]  - imports the whole pack (or of the next sticker sent); re-adding refreshes it
//   /addsticker [collection]               - saves the next sticker to a custom collection (default: uncategorized)
//   /stickers                              - lists saved packs and collections
//   /removesticker [collection]            - removes the next sticker from a collection/pack (default: all custom ones)
//   /removecollection [name|link]          - deletes a collection or pack (or the pack of the next sticker) after /confirm

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

stickers.command("removesticker", async (ctx) => {
    const arg = ctx.payload.trim();
    if (!arg) {
        setPending(ctx.from.id, { kind: "removeSticker", collection: null });
        return ctx.reply("Send the sticker to remove from your collections or /cancel to abort");
    }
    const [collection, ...more] = await findCollections(arg);
    if (!collection) return ctx.reply(`No collection or pack "${arg}". See /stickers`);
    if (more.length) return ctx.reply(`"${arg}" matches both a collection and a pack, use the pack link instead`);
    setPending(ctx.from.id, { kind: "removeSticker", collection: collection.id });
    await ctx.reply(`Send the sticker to remove from "${collection.title}" or /cancel to abort`);
});

stickers.command("removecollection", async (ctx) => {
    const arg = ctx.payload.trim();
    if (!arg) {
        setPending(ctx.from.id, { kind: "removePackBySticker" });
        return ctx.reply("Send a sticker from the pack to remove or /cancel to abort");
    }
    const collections = await findCollections(arg);
    if (!collections.length) return ctx.reply(`No collection or pack "${arg}". See /stickers`);
    await askToConfirmRemoval(ctx, collections);
});

async function askToConfirmRemoval(ctx: BotContext, collections: Awaited<ReturnType<typeof findCollections>>) {
    const label = collections
        .map((c) => `"${c.title}" (${c.kind}, ${c.stickers} ${c.stickers === 1 ? "sticker" : "stickers"})`)
        .join(" and ");
    setPending(ctx.from!.id, { kind: "removeCollection", collectionIds: collections.map((c) => c.id), label });
    await ctx.reply(`Remove ${label}? Send /confirm to remove or /cancel to keep it`);
}

stickers.command("confirm", async (ctx) => {
    const action = getPending(ctx.from.id);
    if (action?.kind !== "removeCollection") return ctx.reply("Nothing to confirm");
    clearPending(ctx.from.id);
    // stickers go with it (on delete cascade)
    await db.delete(stickerCollectionsTable).where(inArray(stickerCollectionsTable.id, action.collectionIds));
    await ctx.reply(`Removed ${action.label}`);
});

const WAITING_FOR_STICKER = new Set(["addPack", "addSticker", "removeSticker", "removePackBySticker"]);

// second step of /addpack, /addsticker, /removesticker and /removecollection without a name
stickers.on("message", async (ctx, next) => {
    const action = getPending(ctx.from.id);
    if (!action || !WAITING_FOR_STICKER.has(action.kind)) return next();

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
    if (action.kind === "removeSticker") return removeSticker(ctx, action.collection, sticker);
    if (action.kind === "removePackBySticker") {
        if (!sticker.set_name) return ctx.reply("This sticker isn't part of a pack");
        const packs = (await findCollections(sticker.set_name)).filter((c) => c.kind === StickerCollectionKinds.pack);
        if (!packs.length) return ctx.reply("This sticker's pack isn't saved. See /stickers");
        return askToConfirmRemoval(ctx, packs);
    }
    if (action.kind !== "addSticker") return;
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

async function removeSticker(ctx: BotContext, collectionId: string | null, sticker: Sticker) {
    const scope = collectionId
        ? eq(stickersTable.collectionId, collectionId)
        : inArray(
              stickersTable.collectionId,
              db
                  .select({ id: stickerCollectionsTable.id })
                  .from(stickerCollectionsTable)
                  .where(eq(stickerCollectionsTable.kind, StickerCollectionKinds.custom))
          );
    const removed = await db
        .delete(stickersTable)
        .where(and(eq(stickersTable.fileUniqueId, sticker.file_unique_id), scope))
        .returning({ collectionId: stickersTable.collectionId });
    if (!removed.length)
        return ctx.reply(
            collectionId ? "That sticker isn't in this collection" : "That sticker isn't in any of your collections"
        );

    // custom collections left empty are dropped; packs stay until /removecollection
    const affectedIds = removed.map((row) => row.collectionId);
    const titles = await db
        .select({ title: stickerCollectionsTable.title })
        .from(stickerCollectionsTable)
        .where(inArray(stickerCollectionsTable.id, affectedIds));
    await db
        .delete(stickerCollectionsTable)
        .where(
            and(
                inArray(stickerCollectionsTable.id, affectedIds),
                eq(stickerCollectionsTable.kind, StickerCollectionKinds.custom),
                notExists(
                    db
                        .select({ id: stickersTable.id })
                        .from(stickersTable)
                        .where(eq(stickersTable.collectionId, stickerCollectionsTable.id))
                )
            )
        );
    await ctx.reply(`Removed from ${titles.map((row) => `"${row.title}"`).join(", ")}`);
}

// matches a custom collection by name/alias and a pack by set name or link (case-insensitive)
async function findCollections(arg: string) {
    const customName = normalizeCollection(arg);
    const setName = parseSetName(arg);
    const conditions: SQL[] = [];
    if (customName) {
        conditions.push(
            and(
                eq(stickerCollectionsTable.kind, StickerCollectionKinds.custom),
                eq(stickerCollectionsTable.name, customName)
            )!
        );
    }
    if (setName) {
        conditions.push(
            and(
                eq(stickerCollectionsTable.kind, StickerCollectionKinds.pack),
                sql`lower(${stickerCollectionsTable.name}) = lower(${setName})`
            )!
        );
    }
    if (!conditions.length) return [];

    return db
        .select({
            id: stickerCollectionsTable.id,
            kind: stickerCollectionsTable.kind,
            title: stickerCollectionsTable.title,
            stickers: count(stickersTable.id),
        })
        .from(stickerCollectionsTable)
        .leftJoin(stickersTable, eq(stickersTable.collectionId, stickerCollectionsTable.id))
        .where(or(...conditions))
        .groupBy(stickerCollectionsTable.id);
}
