CREATE TABLE "report_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"caption" text,
	"data" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "report_image_title_check" CHECK (btrim("report_image"."title") <> '' and char_length("report_image"."title") <= 200),
	CONSTRAINT "report_image_caption_length" CHECK (char_length("report_image"."caption") <= 500),
	CONSTRAINT "report_image_position_check" CHECK ("report_image"."position" >= 0),
	CONSTRAINT "report_image_sha256_hex" CHECK ("report_image"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_image_byte_size_check" CHECK ("report_image"."byte_size" = octet_length("report_image"."data") and "report_image"."byte_size" between 1 and 524288),
	CONSTRAINT "report_image_dimensions_check" CHECK ("report_image"."width" between 1 and 2000 and "report_image"."height" between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "report_image" ADD CONSTRAINT "report_image_section_id_report_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_image" ADD CONSTRAINT "report_image_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_image_section_idx" ON "report_image" USING btree ("section_id","position");