import { Composer } from "telegraf-hardened";
import type { Message, User } from "telegraf-hardened/types";
import {
    conversationsTable,
    ConversationStatuses,
    MediaKinds,
    MessageDirections,
    messagesTable,
    MessageTypes,
    type ConversationsTable,
    type MessagesTable,
} from "@murmur/db";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import type { BotContext } from "./context";

type MessageContent = Pick<
    MessagesTable["$inferInsert"],
    | "type"
    | "text"
    | "mediaKind"
    | "mediaGroupId"
    | "fileId"
    | "fileUniqueId"
    | "fileName"
    | "mimeType"
    | "fileSize"
    | "stickerEmoji"
>;

// Messages from regular users, stored into conversations
export const inbox = new Composer<BotContext>();

inbox.start(async (ctx) => {
    await upsertConversation(ctx);
    await ctx.reply("Hi! Send your message here and you'll get a reply in this chat.");
});

inbox.on("message", async (ctx) => {
    const content = parseMessage(ctx.message);
    if (!content) {
        await ctx.reply("This message type is not supported. Send text, media, a file or a sticker.");
        return;
    }

    const conversation = await upsertConversation(ctx);
    if (conversation.status === ConversationStatuses.blocked) return;

    const replyTo =
        "reply_to_message" in ctx.message && ctx.message.reply_to_message
            ? await db.query.messagesTable.findFirst({
                  columns: { id: true },
                  where: and(
                      eq(messagesTable.conversationId, conversation.id),
                      eq(messagesTable.telegramMessageId, ctx.message.reply_to_message.message_id)
                  ),
              })
            : undefined;

    const now = new Date(ctx.message.date * 1000);
    await db
        .insert(messagesTable)
        .values({
            ...content,
            conversationId: conversation.id,
            replyToId: replyTo?.id,
            direction: MessageDirections.incoming,
            telegramMessageId: ctx.message.message_id,
            createdAt: now,
        })
        .onConflictDoNothing();

    await db
        .update(conversationsTable)
        .set({ lastMessageAt: now, status: ConversationStatuses.active })
        .where(eq(conversationsTable.id, conversation.id));
});

async function upsertConversation(ctx: BotContext): Promise<ConversationsTable["$inferSelect"]> {
    const from = ctx.from!;
    const profile = {
        telegramChatId: ctx.chat!.id,
        telegramUserId: from.id,
        username: from.username ?? null,
        firstName: from.first_name,
        lastName: from.last_name ?? null,
        languageCode: from.language_code ?? null,
        isPremium: from.is_premium ?? false,
    };

    const existing = await db.query.conversationsTable.findFirst({
        where: eq(conversationsTable.telegramUserId, from.id),
    });
    if (existing) {
        const [updated] = await db
            .update(conversationsTable)
            .set(profile)
            .where(eq(conversationsTable.id, existing.id))
            .returning();
        return updated;
    }

    const photoFileId = await fetchProfilePhoto(ctx, from);
    const [created] = await db
        .insert(conversationsTable)
        .values({ ...profile, photoFileId })
        .onConflictDoUpdate({ target: conversationsTable.telegramUserId, set: profile })
        .returning();
    return created;
}

async function fetchProfilePhoto(ctx: BotContext, user: User): Promise<string | null> {
    try {
        const { photos } = await ctx.telegram.getUserProfilePhotos(user.id, 0, 1);
        return photos[0]?.at(-1)?.file_id ?? null;
    } catch {
        return null;
    }
}

function parseMessage(message: Message): MessageContent | null {
    const caption = "caption" in message ? (message.caption ?? null) : null;
    const mediaGroupId = "media_group_id" in message ? (message.media_group_id ?? null) : null;
    const media = (
        mediaKind: MessageContent["mediaKind"],
        file: { file_id: string; file_unique_id: string; file_size?: number; file_name?: string; mime_type?: string }
    ): MessageContent => ({
        type: MessageTypes.media,
        text: caption,
        mediaKind,
        mediaGroupId,
        fileId: file.file_id,
        fileUniqueId: file.file_unique_id,
        fileName: file.file_name ?? null,
        mimeType: file.mime_type ?? null,
        fileSize: file.file_size ?? null,
    });

    if ("text" in message) return { type: MessageTypes.text, text: message.text };
    if ("sticker" in message) {
        return {
            type: MessageTypes.sticker,
            fileId: message.sticker.file_id,
            fileUniqueId: message.sticker.file_unique_id,
            fileSize: message.sticker.file_size ?? null,
            stickerEmoji: message.sticker.emoji ?? null,
        };
    }
    if ("photo" in message) return media(MediaKinds.photo, message.photo.at(-1)!);
    // animation messages also carry `document`, so check them first
    if ("animation" in message) return media(MediaKinds.animation, message.animation);
    if ("video" in message) return media(MediaKinds.video, message.video);
    if ("video_note" in message) return media(MediaKinds.videoNote, message.video_note);
    if ("voice" in message) return media(MediaKinds.voice, message.voice);
    if ("audio" in message) return media(MediaKinds.audio, message.audio);
    if ("document" in message) return media(MediaKinds.document, message.document);
    return null;
}
