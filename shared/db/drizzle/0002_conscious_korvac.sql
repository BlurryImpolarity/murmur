CREATE TYPE "public"."STICKER_COLLECTION_KIND" AS ENUM('pack', 'custom');--> statement-breakpoint
CREATE TABLE "sticker_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "STICKER_COLLECTION_KIND" NOT NULL,
	"name" varchar(64) NOT NULL,
	"title" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sticker_collections_kind_name_unique" UNIQUE("kind","name")
);
--> statement-breakpoint
CREATE TABLE "stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"file_id" varchar(256) NOT NULL,
	"file_unique_id" varchar(64) NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"emoji" varchar(16),
	"set_name" varchar(64),
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stickers_collection_file_unique" UNIQUE("collection_id","file_unique_id")
);
--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_collection_id_sticker_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."sticker_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stickers_collection_position_idx" ON "stickers" USING btree ("collection_id","position");