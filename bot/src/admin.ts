import { Composer, type MiddlewareFn } from "telegraf-hardened";
import { adminsTable, conversationsTable, messagesTable, MessageStatuses } from "@murmur/db";
import { count, eq } from "drizzle-orm";
import { db } from "./db";
import type { BotContext } from "./context";
import { groupReply } from "./group-reply";
import { clearPending } from "./pending";
import { stickers } from "./stickers";
import { gifs } from "./gifs";

// Resolves ctx.admin by telegram user id
export const loadAdmin: MiddlewareFn<BotContext> = async (ctx, next) => {
    if (ctx.from) {
        ctx.admin = await db.query.adminsTable.findFirst({ where: eq(adminsTable.telegramUserId, ctx.from.id) });
    }
    return next();
};

// Admin chats are handled here and never stored in conversations
export const adminComposer = new Composer<BotContext>();

const HELP = `Admin commands:
/help - this message
/ping - check the bot is alive
/stats - conversations and delivery stats
/cancel - cancel a command waiting for your next message

Group chat:
/reply <link|id> [text] - reply to a group message as the bot; without text, your next message is sent

Stickers:
/stickers - list saved collections and packs
/addpack [name|link] - save a whole pack (or send a sticker from it next)
/addsticker [collection] - save the next sticker (default: uncategorized, "fav" = favorites)
/removesticker [collection] - remove the next sticker (default: from all your collections, packs untouched)
/removecollection [name|link] - delete a collection or pack, or the pack of the next sticker (asks to /confirm)

GIFs:
/gifs - show how many GIFs are saved
/addgif - save the next GIF
/removegif - remove the next GIF

People's messages are answered in the web app.`;

adminComposer.start((ctx) => ctx.reply(`Admin mode, ${ctx.admin!.login}.\n\n${HELP}`));

adminComposer.help((ctx) => ctx.reply(HELP));

adminComposer.command("ping", (ctx) => ctx.reply(`Pong (admin: ${ctx.admin!.login})`));

adminComposer.command("stats", async (ctx) => {
    const [[conversations], [pending], [failed]] = await Promise.all([
        db.select({ n: count() }).from(conversationsTable),
        db.select({ n: count() }).from(messagesTable).where(eq(messagesTable.status, MessageStatuses.pending)),
        db.select({ n: count() }).from(messagesTable).where(eq(messagesTable.status, MessageStatuses.failed)),
    ]);
    await ctx.reply(`Conversations: ${conversations.n}\nPending: ${pending.n}\nFailed: ${failed.n}`);
});

// drops whatever command is waiting (/reply, sticker and GIF commands)
adminComposer.command("cancel", (ctx) => ctx.reply(clearPending(ctx.from.id) ? "Cancelled" : "Nothing to cancel"));

adminComposer.use(groupReply, stickers, gifs);

adminComposer.on("message", (ctx) => ctx.reply("Admin chat is not stored. Use the web app to reply to people"));
