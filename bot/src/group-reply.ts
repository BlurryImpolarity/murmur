import { Composer, type Telegram } from "telegraf-hardened";
import type { MessageEntity } from "telegraf-hardened/types";
import { env } from "./env";
import { clearPending, getPending, setPending } from "./pending";
import type { BotContext } from "./context";

// Admin command to reply to a message in the group chat (GROUP_CHAT_ID) on behalf of the bot.
//   /reply <link|id> <text>  - sends the text (formatting kept)
//   /reply <link|id>         - the next message (any type) is copied into the group as the reply
//   /cancel                  - drops a pending reply (handled in admin.ts)

const USAGE = "Usage: /reply <message link or id> [text]\nWithout text, the next message you send becomes the reply.";

export const groupReply = new Composer<BotContext>();

groupReply.command("reply", async (ctx) => {
    if (!env.groupChatId) return ctx.reply("GROUP_CHAT_ID is not configured");

    // "/reply <ref> <text...>": everything after the ref is the reply, keeping its offset for entities
    const match = /^\/\S+\s+(\S+)\s*/.exec(ctx.message.text);
    if (!match) return ctx.reply(USAGE);

    const target = await resolveMessageId(ctx.telegram, match[1], env.groupChatId);
    if (typeof target === "string") return ctx.reply(target);

    const textStart = match[0].length;
    const text = ctx.message.text.slice(textStart);
    if (!text) {
        setPending(ctx.from.id, { kind: "groupReply", messageId: target });
        return ctx.reply("Send the reply or /cancel to abort");
    }

    const entities = (ctx.message.entities ?? [])
        .filter((entity) => entity.offset >= textStart)
        .map((entity) => ({ ...entity, offset: entity.offset - textStart }) as MessageEntity);

    await deliver(ctx, () =>
        ctx.telegram.sendMessage(env.groupChatId!, text, {
            entities,
            reply_parameters: { message_id: target, allow_sending_without_reply: false },
        })
    );
});

// second step: copy whatever the admin sent as the reply
groupReply.on("message", async (ctx, next) => {
    const action = getPending(ctx.from.id);
    // commands are never sent to the group by accident
    if (action?.kind !== "groupReply" || ("text" in ctx.message && ctx.message.text.startsWith("/"))) return next();
    clearPending(ctx.from.id);

    await deliver(ctx, () =>
        ctx.telegram.copyMessage(env.groupChatId!, ctx.chat.id, ctx.message.message_id, {
            reply_parameters: { message_id: action.messageId, allow_sending_without_reply: false },
        })
    );
});

async function deliver(ctx: BotContext, send: () => Promise<{ message_id: number }>) {
    try {
        const sent = await send();
        const link = messageLink(env.groupChatId!, sent.message_id);
        await ctx.reply(link ? `Sent: ${link}` : "Sent");
    } catch (err) {
        await ctx.reply(`Failed to send: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// Accepts a message id, t.me/c/<chat>/<message> (private, optionally with topic) or t.me/<username>/<message>.
// Returns the message id, or an error text for the admin.
async function resolveMessageId(telegram: Telegram, ref: string, groupChatId: number): Promise<number | string> {
    if (/^\d+$/.test(ref)) return Number(ref);

    let url: URL;
    try {
        url = new URL(/^https?:\/\//.test(ref) ? ref : `https://${ref}`);
    } catch {
        return USAGE;
    }
    if (!["t.me", "telegram.me"].includes(url.hostname)) return USAGE;

    const parts = url.pathname.split("/").filter(Boolean);
    const messageId = Number(parts.at(-1));
    if (parts.length < 2 || !Number.isInteger(messageId)) return "Couldn't find a message id in that link";

    let chatId: number;
    if (parts[0] === "c") {
        chatId = Number(`-100${parts[1]}`);
    } else {
        try {
            chatId = (await telegram.getChat(`@${parts[0]}`)).id;
        } catch {
            return `Couldn't resolve @${parts[0]}`;
        }
    }
    if (chatId !== groupChatId) return "That link points to a different chat than GROUP_CHAT_ID";
    return messageId;
}

// links only work for supergroups (ids starting with -100)
function messageLink(chatId: number, messageId: number): string | null {
    const id = String(chatId);
    return id.startsWith("-100") ? `https://t.me/c/${id.slice(4)}/${messageId}` : null;
}

// Logs a hint at startup if GROUP_CHAT_ID isn't reachable, e.g. a basic group id (-123) after the group
// was upgraded to a supergroup (-100123)
export async function checkGroupChat(telegram: Telegram) {
    if (!env.groupChatId) return;
    try {
        const chat = await telegram.getChat(env.groupChatId);
    } catch (err) {
        const asSupergroup = Number(`-100${String(env.groupChatId).replace(/^-/, "")}`);
        const hint = await telegram
            .getChat(asSupergroup)
            .then(() => ` It looks like a supergroup now: set GROUP_CHAT_ID=${asSupergroup}`)
            .catch(() => " Check the id and that the bot is a member of the group");
        console.warn(`GROUP_CHAT_ID=${env.groupChatId} is not reachable: ${(err as Error).message}.${hint}`);
    }
}
