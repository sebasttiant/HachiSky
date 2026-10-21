CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"client_id" uuid NOT NULL,
	"period_start" date,
	"period_end" date,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "report_type_check" CHECK ("report"."type" in ('follow_up', 'diagnostic', 'general', 'infrastructure', 'manual')),
	CONSTRAINT "report_status_check" CHECK ("report"."status" in ('draft')),
	CONSTRAINT "report_title_check" CHECK (btrim("report"."title") <> '' and char_length("report"."title") <= 200),
	CONSTRAINT "report_period_check" CHECK ("report"."period_start" is null or "report"."period_end" is null
        or "report"."period_end" >= "report"."period_start")
);
--> statement-breakpoint
CREATE TABLE "report_activity" (
	"report_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "report_activity_report_id_activity_id_pk" PRIMARY KEY("report_id","activity_id"),
	CONSTRAINT "report_activity_position_check" CHECK ("report_activity"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"body" text,
	"status" text,
	"priority" text,
	"impact" text,
	CONSTRAINT "report_item_label_check" CHECK (btrim("report_item"."label") <> '' and char_length("report_item"."label") <= 200),
	CONSTRAINT "report_item_body_length" CHECK (char_length("report_item"."body") <= 5000),
	CONSTRAINT "report_item_status_check" CHECK ("report_item"."status" is null or "report_item"."status" in ('ok', 'watch', 'risk')),
	CONSTRAINT "report_item_priority_check" CHECK ("report_item"."priority" is null or "report_item"."priority" in ('low', 'medium', 'high')),
	CONSTRAINT "report_item_impact_length" CHECK (char_length("report_item"."impact") <= 500),
	CONSTRAINT "report_item_position_check" CHECK ("report_item"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"kind" text DEFAULT 'prose' NOT NULL,
	"heading" text NOT NULL,
	"body" text,
	CONSTRAINT "report_section_key_unique" UNIQUE("report_id","key"),
	CONSTRAINT "report_section_kind_check" CHECK ("report_section"."kind" in ('prose', 'findings', 'status_table', 'inventory', 'steps')),
	CONSTRAINT "report_section_key_check" CHECK (btrim("report_section"."key") <> '' and char_length("report_section"."key") <= 60),
	CONSTRAINT "report_section_heading_check" CHECK (btrim("report_section"."heading") <> '' and char_length("report_section"."heading") <= 200),
	CONSTRAINT "report_section_body_length" CHECK (char_length("report_section"."body") <= 20000),
	CONSTRAINT "report_section_position_check" CHECK ("report_section"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_activity" ADD CONSTRAINT "report_activity_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_activity" ADD CONSTRAINT "report_activity_activity_id_work_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."work_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_item" ADD CONSTRAINT "report_item_section_id_report_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_section" ADD CONSTRAINT "report_section_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_client_idx" ON "report" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "report_author_idx" ON "report" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "report_activity_report_idx" ON "report_activity" USING btree ("report_id","position");--> statement-breakpoint
CREATE INDEX "report_item_section_idx" ON "report_item" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "report_section_report_idx" ON "report_section" USING btree ("report_id","position");