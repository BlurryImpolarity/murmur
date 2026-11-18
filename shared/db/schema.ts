import {
    bigint,
    boolean,
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
    type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ========= ADMINS =========
// Web app logs in with login + password; bot treats `telegramUserId` as admin and never stores those chats.
export const adminsTable = pgTable("admins", {
    id: uuid().primaryKey().defaultRandom(),

    login: varchar({ length: 64 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 256 }).notNull(),
    telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => new Date()),
});
export type AdminsTable = typeof adminsTable;

// ========= CONVERSATIONS =========
export const ConversationStatuses = {
    active: "active",
    archived: "archived",
    blocked: "blocked",
} as const;
export type ConversationStatus = keyof typeof ConversationStatuses;

export const conversationStatusEnum = pgEnum("CONVERSATION_STATUS", ConversationStatuses);

// One conversation per telegram private chat with the bot.
// Profile fields mirror the telegram user and are refreshed by the bot on each incoming update.
export const conversationsTable = pgTable(
    "conversations",
    {
        id: uuid().primaryKey().defaultRandom(),

        telegramChatId: bigint("telegram_chat_id", { mode: "number" }).notNull().unique(),
        telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull().unique(),
        username: varchar({ length: 64 }),
        firstName: varchar("first_name", { length: 256 }).notNull(),
        lastName: varchar("last_name", { length: 256 }),
        languageCode: varchar("language_code", { length: 16 }),
        isPremium: boolean("is_premium").notNull().default(false),
        photoFileId: varchar("photo_file_id", { length: 256 }),

        status: conversationStatusEnum().default(ConversationStatuses.active).notNull(),

        lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    (table) => [index("conversations_status_last_message_idx").on(table.status, table.lastMessageAt.desc())]
);
export type ConversationsTable = typeof conversationsTable;

// ========= MESSAGES =========
export const MessageDirections = {
    incoming: "incoming", // from telegram user to the bot
    outgoing: "outgoing", // from web app to the telegram user
} as const;
export type MessageDirection = keyof typeof MessageDirections;

export const messageDirectionEnum = pgEnum("MESSAGE_DIRECTION", MessageDirections);

export const MessageTypes = {
    text: "text",
    media: "media",
    sticker: "sticker",
} as const;
export type MessageType = keyof typeof MessageTypes;

export const messageTypeEnum = pgEnum("MESSAGE_TYPE", MessageTypes);

export const MediaKinds = {
    photo: "photo",
    video: "video",
    animation: "animation",
    audio: "audio",
    voice: "voice",
    videoNote: "video_note",
    document: "document", // any file sent as a file, incl. uncompressed photos/videos
} as const;
export type MediaKind = (typeof MediaKinds)[keyof typeof MediaKinds];

export const mediaKindEnum = pgEnum("MEDIA_KIND", MediaKinds);

// Delivery lifecycle of outgoing messages: web app inserts `pending`, bot claims it (`sending`) and resolves it.
export const MessageStatuses = {
    pending: "pending",
    sending: "sending",
    sent: "sent",
    failed: "failed",
} as const;
export type MessageStatus = keyof typeof MessageStatuses;

export const messageStatusEnum = pgEnum("MESSAGE_STATUS", MessageStatuses);

export const messagesTable = pgTable(
    "messages",
    {
        id: uuid().primaryKey().defaultRandom(),
        conversationId: uuid("conversation_id")
            .references(() => conversationsTable.id, { onDelete: "cascade" })
            .notNull(),
        replyToId: uuid("reply_to_id").references((): AnyPgColumn => messagesTable.id, { onDelete: "set null" }),

        direction: messageDirectionEnum().notNull(),
        type: messageTypeEnum().notNull(),

        // text body for `text`, caption for `media`
        text: text(),

        // media & sticker payload; telegram file_id is reusable by the same bot for re-sending
        mediaKind: mediaKindEnum("media_kind"),
        mediaGroupId: varchar("media_group_id", { length: 64 }),
        fileId: varchar("file_id", { length: 256 }),
        fileUniqueId: varchar("file_unique_id", { length: 64 }),
        fileName: varchar("file_name", { length: 256 }),
        mimeType: varchar("mime_type", { length: 128 }),
        fileSize: integer("file_size"),
        stickerEmoji: varchar("sticker_emoji", { length: 16 }),

        // telegram message_id: set on receive for incoming, after delivery for outgoing
        telegramMessageId: bigint("telegram_message_id", { mode: "number" }),

        // outgoing only
        status: messageStatusEnum(),
        attempts: integer().notNull().default(0),
        error: text(),
        sentAt: timestamp("sent_at", { withTimezone: true }),

        // incoming only, for unread counters in web app
        readAt: timestamp("read_at", { withTimezone: true }),

        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    (table) => [
        unique("messages_conversation_telegram_message_unique").on(table.conversationId, table.telegramMessageId),
        index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
        index("messages_pending_idx")
            .on(table.createdAt)
            .where(sql`${table.status} = 'pending'`),
        check(
            "messages_status_direction_check",
            sql`(${table.direction} = 'outgoing') = (${table.status} IS NOT NULL)`
        ),
        check("messages_media_kind_check", sql`(${table.type} = 'media') = (${table.mediaKind} IS NOT NULL)`),
        check("messages_text_check", sql`${table.type} <> 'text' OR ${table.text} IS NOT NULL`),
        check("messages_sticker_check", sql`${table.type} <> 'sticker' OR ${table.fileId} IS NOT NULL`),
    ]
);
export type MessagesTable = typeof messagesTable;

// ========= RELATIONS =========
export const conversationsRelations = relations(conversationsTable, ({ many }) => ({
    messages: many(messagesTable),
}));

export const messagesRelations = relations(messagesTable, ({ one }) => ({
    conversation: one(conversationsTable, {
        fields: [messagesTable.conversationId],
        references: [conversationsTable.id],
    }),
    replyTo: one(messagesTable, {
        fields: [messagesTable.replyToId],
        references: [messagesTable.id],
    }),
}));
