CREATE TYPE "public"."CONVERSATION_STATUS" AS ENUM('active', 'archived', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."MEDIA_KIND" AS ENUM('photo', 'video', 'animation', 'audio', 'voice', 'video_note', 'document');--> statement-breakpoint
CREATE TYPE "public"."MESSAGE_DIRECTION" AS ENUM('incoming', 'outgoing');--> statement-breakpoint
CREATE TYPE "public"."MESSAGE_STATUS" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."MESSAGE_TYPE" AS ENUM('text', 'media', 'sticker');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" varchar(64) NOT NULL,
	"password_hash" varchar(256) NOT NULL,
	"telegram_user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_login_unique" UNIQUE("login"),
	CONSTRAINT "admins_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"username" varchar(64),
	"first_name" varchar(256) NOT NULL,
	"last_name" varchar(256),
	"language_code" varchar(16),
	"is_premium" boolean DEFAULT false NOT NULL,
	"photo_file_id" varchar(256),
	"status" "CONVERSATION_STATUS" DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_telegram_chat_id_unique" UNIQUE("telegram_chat_id"),
	CONSTRAINT "conversations_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"reply_to_id" uuid,
	"direction" "MESSAGE_DIRECTION" NOT NULL,
	"type" "MESSAGE_TYPE" NOT NULL,
	"text" text,
	"media_kind" "MEDIA_KIND",
	"media_group_id" varchar(64),
	"file_id" varchar(256),
	"file_unique_id" varchar(64),
	"file_name" varchar(256),
	"mime_type" varchar(128),
	"file_size" integer,
	"sticker_emoji" varchar(16),
	"telegram_message_id" bigint,
	"status" "MESSAGE_STATUS",
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_conversation_telegram_message_unique" UNIQUE("conversation_id","telegram_message_id"),
	CONSTRAINT "messages_status_direction_check" CHECK (("messages"."direction" = 'outgoing') = ("messages"."status" IS NOT NULL)),
	CONSTRAINT "messages_media_kind_check" CHECK (("messages"."type" = 'media') = ("messages"."media_kind" IS NOT NULL)),
	CONSTRAINT "messages_text_check" CHECK ("messages"."type" <> 'text' OR "messages"."text" IS NOT NULL),
	CONSTRAINT "messages_sticker_check" CHECK ("messages"."type" <> 'sticker' OR "messages"."file_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_status_last_message_idx" ON "conversations" USING btree ("status","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_pending_idx" ON "messages" USING btree ("created_at") WHERE "messages"."status" = 'pending';