import type { Telegram } from "telegraf-hardened";
import type { MessageEntity } from "telegraf-hardened/types";
import {
    ConversationStatuses,
    MediaKinds,
    messagesTable,
    MessageStatuses,
    MessageTypes,
    type ConversationsTable,
    type MessagesTable,
} from "@murmur/db";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";

const BATCH_SIZE = 20;
const BACKOFF_FACTOR = 1.5;

type OutgoingMessage = MessagesTable["$inferSelect"] & {
    conversation: ConversationsTable["$inferSelect"];
    replyTo: MessagesTable["$inferSelect"] | null;
};

// Polls `pending` messages created by the web app and delivers them.
// Interval is adaptive: drops to the minimum once something was sent, then grows back to the default.
export async function startOutbox(telegram: Telegram): Promise<() => void> {
    // messages left in `sending` after a crash may or may not have been delivered; don't resend blindly
    await db
        .update(messagesTable)
        .set({ status: MessageStatuses.failed, error: "interrupted while sending" })
        .where(eq(messagesTable.status, MessageStatuses.sending));

    let interval = env.outboxIntervalMs;
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;

    const tick = async () => {
        try {
            const sent = await flush(telegram);
            interval = sent > 0 ? env.outboxMinIntervalMs : Math.min(env.outboxIntervalMs, interval * BACKOFF_FACTOR);
        } catch (err) {
            console.error("outbox flush failed", err);
            interval = env.outboxIntervalMs;
        }
        if (!stopped) timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);

    return () => {
        stopped = true;
        clearTimeout(timer);
    };
}

// returns how many messages were processed
async function flush(telegram: Telegram): Promise<number> {
    const ids = await claim();
    if (!ids.length) return 0;

    const messages = await db.query.messagesTable.findMany({
        where: inArray(messagesTable.id, ids),
        with: { conversation: true, replyTo: true },
        orderBy: asc(messagesTable.createdAt),
    });

    for (const message of messages) {
        try {
            if (message.conversation.status === ConversationStatuses.blocked) {
                throw new Error("conversation is blocked");
            }
            const sent = await send(telegram, message);
            await db
                .update(messagesTable)
                .set({
                    status: MessageStatuses.sent,
                    telegramMessageId: sent.message_id,
                    sentAt: new Date(),
                    error: null,
                })
                .where(eq(messagesTable.id, message.id));
        } catch (err) {
            await db
                .update(messagesTable)
                .set({ status: MessageStatuses.failed, error: err instanceof Error ? err.message : String(err) })
                .where(eq(messagesTable.id, message.id));
        }
    }
    return messages.length;
}

// Atomically moves a batch of `pending` messages to `sending`, safe with multiple bot instances
async function claim(): Promise<string[]> {
    return db.transaction(async (tx) => {
        const rows = await tx
            .select({ id: messagesTable.id })
            .from(messagesTable)
            .where(eq(messagesTable.status, MessageStatuses.pending))
            .orderBy(asc(messagesTable.createdAt))
            .limit(BATCH_SIZE)
            .for("update", { skipLocked: true });

        const ids = rows.map((row) => row.id);
        if (ids.length) {
            await tx
                .update(messagesTable)
                .set({ status: MessageStatuses.sending, attempts: sql`${messagesTable.attempts} + 1` })
                .where(inArray(messagesTable.id, ids));
        }
        return ids;
    });
}

async function send(telegram: Telegram, message: OutgoingMessage): Promise<{ message_id: number }> {
    const chatId = message.conversation.telegramChatId;
    const extra = message.replyTo?.telegramMessageId
        ? { reply_parameters: { message_id: message.replyTo.telegramMessageId, allow_sending_without_reply: true } }
        : {};

    const entities = (message.entities ?? undefined) as MessageEntity[] | undefined;

    switch (message.type) {
        case MessageTypes.text:
            return telegram.sendMessage(chatId, message.text!, { ...extra, entities });
        case MessageTypes.sticker:
            return telegram.sendSticker(chatId, message.fileId!, extra);
        case MessageTypes.media: {
            // TODO: web app uploads have no telegram file_id yet, needs storage
            if (!message.fileId) throw new Error("media without file_id is not supported yet");
            const file = message.fileId;
            const withCaption = { ...extra, caption: message.text ?? undefined, caption_entities: entities };
            switch (message.mediaKind) {
                case MediaKinds.photo:
                    return telegram.sendPhoto(chatId, file, withCaption);
                case MediaKinds.video:
                    return telegram.sendVideo(chatId, file, withCaption);
                case MediaKinds.animation:
                    return telegram.sendAnimation(chatId, file, withCaption);
                case MediaKinds.audio:
                    return telegram.sendAudio(chatId, file, withCaption);
                case MediaKinds.voice:
                    return telegram.sendVoice(chatId, file, withCaption);
                case MediaKinds.videoNote:
                    return telegram.sendVideoNote(chatId, file, extra);
                case MediaKinds.document:
                    return telegram.sendDocument(chatId, file, withCaption);
            }
        }
    }
    throw new Error(`unsupported message: ${message.type}/${message.mediaKind}`);
}
