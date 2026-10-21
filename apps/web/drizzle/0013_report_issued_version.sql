CREATE TABLE "report_issued_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"client_name" text NOT NULL,
	"performed_on" date NOT NULL,
	"started_at" time,
	"ended_at" time,
	"status" text NOT NULL,
	"outcome" text,
	CONSTRAINT "report_issued_activity_position_check" CHECK ("report_issued_activity"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_issued_image" (
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
	CONSTRAINT "report_issued_image_position_check" CHECK ("report_issued_image"."position" >= 0),
	CONSTRAINT "report_issued_image_sha256_hex" CHECK ("report_issued_image"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_issued_image_byte_size_check" CHECK ("report_issued_image"."byte_size" = octet_length("report_issued_image"."data") and "report_issued_image"."byte_size" between 1 and 524288),
	CONSTRAINT "report_issued_image_dimensions_check" CHECK ("report_issued_image"."width" between 1 and 2000 and "report_issued_image"."height" between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "report_issued_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"body" text,
	"status" text,
	"priority" text,
	"impact" text,
	CONSTRAINT "report_issued_item_status_check" CHECK ("report_issued_item"."status" is null or "report_issued_item"."status" in ('ok', 'watch', 'risk')),
	CONSTRAINT "report_issued_item_priority_check" CHECK ("report_issued_item"."priority" is null or "report_issued_item"."priority" in ('low', 'medium', 'high')),
	CONSTRAINT "report_issued_item_position_check" CHECK ("report_issued_item"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_issued_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"kind" text DEFAULT 'prose' NOT NULL,
	"heading" text NOT NULL,
	"body" text,
	CONSTRAINT "report_issued_section_key_unique" UNIQUE("version_id","key"),
	CONSTRAINT "report_issued_section_kind_check" CHECK ("report_issued_section"."kind" in ('prose', 'findings', 'status_table', 'inventory', 'steps')),
	CONSTRAINT "report_issued_section_position_check" CHECK ("report_issued_section"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_issued_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" text NOT NULL,
	"type" text NOT NULL,
	"client_name" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"title" text NOT NULL,
	"author_user_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_job_title" text,
	CONSTRAINT "report_issued_version_report_unique" UNIQUE("report_id"),
	CONSTRAINT "report_issued_version_check" CHECK ("report_issued_version"."version" >= 1),
	CONSTRAINT "report_issued_title_check" CHECK (btrim("report_issued_version"."title") <> '' and char_length("report_issued_version"."title") <= 200)
);
--> statement-breakpoint
ALTER TABLE "report" DROP CONSTRAINT "report_status_check";--> statement-breakpoint
ALTER TABLE "report_issued_activity" ADD CONSTRAINT "report_issued_activity_version_id_report_issued_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."report_issued_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_image" ADD CONSTRAINT "report_issued_image_section_id_report_issued_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_issued_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_item" ADD CONSTRAINT "report_issued_item_section_id_report_issued_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_issued_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_section" ADD CONSTRAINT "report_issued_section_version_id_report_issued_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."report_issued_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD CONSTRAINT "report_issued_version_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD CONSTRAINT "report_issued_version_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD CONSTRAINT "report_issued_version_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_issued_activity_version_idx" ON "report_issued_activity" USING btree ("version_id","position");--> statement-breakpoint
CREATE INDEX "report_issued_image_section_idx" ON "report_issued_image" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "report_issued_item_section_idx" ON "report_issued_item" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "report_issued_section_version_idx" ON "report_issued_section" USING btree ("version_id","position");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_status_check" CHECK ("report"."status" in ('draft', 'issued'));