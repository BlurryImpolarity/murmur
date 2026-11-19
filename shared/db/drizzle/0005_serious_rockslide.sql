CREATE TABLE "gifs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" varchar(256) NOT NULL,
	"file_unique_id" varchar(64) NOT NULL,
	"thumbnail_file_id" varchar(256),
	"mime_type" varchar(128),
	"file_name" varchar(256),
	"file_size" integer,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gifs_file_unique_id_unique" UNIQUE("file_unique_id")
);
--> statement-breakpoint
CREATE INDEX "gifs_created_idx" ON "gifs" USING btree ("created_at");