import { Composer } from "telegraf-hardened";
import type { Animation } from "telegraf-hardened/types";
import { gifsTable } from "@murmur/db";
import { count, eq } from "drizzle-orm";
import { db } from "./db";
import { clearPending, getPending, setPending } from "./pending";
import type { BotContext } from "./context";

// Admin commands to save GIFs (telegram animations) for sending from the web app:
//   /addgif     - saves the next GIF sent
//   /removegif  - removes the next GIF sent
//   /gifs       - shows how many GIFs are saved

export const gifs = new Composer<BotContext>();

gifs.command("addgif", async (ctx) => {
    setPending(ctx.from.id, { kind: "addGif" });
    await ctx.reply("Send a GIF to save or /cancel to abort");
});

gifs.command("removegif", async (ctx) => {
    setPending(ctx.from.id, { kind: "removeGif" });
    await ctx.reply("Send the GIF to remove or /cancel to abort");
});

gifs.command("gifs", async (ctx) => {
    const [{ n }] = await db.select({ n: count() }).from(gifsTable);
    await ctx.reply(n ? `Saved GIFs: ${n}` : "No GIFs saved yet. Use /addgif");
});

// second step of /addgif and /removegif
gifs.on("message", async (ctx, next) => {
    const action = getPending(ctx.from.id);
    if (action?.kind !== "addGif" && action?.kind !== "removeGif") return next();

    if (!("animation" in ctx.message)) {
        // commands go through, anything else is a mistake
        if ("text" in ctx.message && ctx.message.text.startsWith("/")) return next();
        return ctx.reply("That's not a GIF. Send a GIF or /cancel to abort");
    }
    clearPending(ctx.from.id);
    const animation = ctx.message.animation;

    if (action.kind === "removeGif") {
        const removed = await db
            .delete(gifsTable)
            .where(eq(gifsTable.fileUniqueId, animation.file_unique_id))
            .returning({ id: gifsTable.id });
        return ctx.reply(removed.length ? "GIF removed" : "That GIF isn't saved");
    }

    const inserted = await db
        .insert(gifsTable)
        .values(gifValues(animation))
        .onConflictDoNothing({ target: gifsTable.fileUniqueId })
        .returning({ id: gifsTable.id });
    await ctx.reply(inserted.length ? "GIF saved" : "That GIF is already saved");
});

function gifValues(animation: Animation) {
    return {
        fileId: animation.file_id,
        fileUniqueId: animation.file_unique_id,
        thumbnailFileId: animation.thumbnail?.file_id ?? null,
        mimeType: animation.mime_type ?? null,
        fileName: animation.file_name ?? null,
        fileSize: animation.file_size ?? null,
        width: animation.width,
        height: animation.height,
    };
}
