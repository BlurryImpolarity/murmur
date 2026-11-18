import { Composer, type MiddlewareFn } from "telegraf-hardened";
import { adminsTable, conversationsTable, messagesTable, MessageStatuses } from "@murmur/db";
import { count, eq } from "drizzle-orm";
import { db } from "./db";
import type { BotContext } from "./context";
import { groupReply } from "./group-reply";
import { clearPending } from "./pending";
import { stickers } from "./stickers";

// Resolves ctx.admin by telegram user id
export const loadAdmin: MiddlewareFn<BotContext> = async (ctx, next) => {
    if (ctx.from) {
        ctx.admin = await db.query.adminsTable.findFirst({ where: eq(adminsTable.telegramUserId, ctx.from.id) });
    }
    return next();
};

// Admin chats are handled here and never stored in conversations
export const adminComposer = new Composer<BotContext>();

adminComposer.start((ctx) =>
    ctx.reply(
        `Admin mode, ${ctx.admin!.login}. Commands: /ping, /stats, /reply, /addpack, /addsticker, /stickers, /cancel`
    )
);

adminComposer.command("ping", (ctx) => ctx.reply(`Pong (admin: ${ctx.admin!.login})`));

adminComposer.command("stats", async (ctx) => {
    const [[conversations], [pending], [failed]] = await Promise.all([
        db.select({ n: count() }).from(conversationsTable),
        db.select({ n: count() }).from(messagesTable).where(eq(messagesTable.status, MessageStatuses.pending)),
        db.select({ n: count() }).from(messagesTable).where(eq(messagesTable.status, MessageStatuses.failed)),
    ]);
    await ctx.reply(`Conversations: ${conversations.n}\nPending: ${pending.n}\nFailed: ${failed.n}`);
});

// drops whatever command is waiting for the next message (/reply, /addpack, /addsticker)
adminComposer.command("cancel", (ctx) => ctx.reply(clearPending(ctx.from.id) ? "Cancelled" : "Nothing to cancel"));

adminComposer.use(groupReply, stickers);

adminComposer.on("message", (ctx) => ctx.reply("Admin chat is not stored. Use the web app to reply to people"));
