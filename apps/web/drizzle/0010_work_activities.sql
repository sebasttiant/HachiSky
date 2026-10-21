CREATE TABLE "work_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"performed_on" date NOT NULL,
	"started_at" time,
	"ended_at" time,
	"title" text NOT NULL,
	"description" text,
	"outcome" text,
	"status" text NOT NULL,
	"next_steps" text,
	"author_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "work_activity_title_check" CHECK (btrim("work_activity"."title") <> '' and char_length("work_activity"."title") <= 200),
	CONSTRAINT "work_activity_description_length" CHECK (char_length("work_activity"."description") <= 5000),
	CONSTRAINT "work_activity_outcome_length" CHECK (char_length("work_activity"."outcome") <= 2000),
	CONSTRAINT "work_activity_next_steps_length" CHECK (char_length("work_activity"."next_steps") <= 2000),
	CONSTRAINT "work_activity_status_check" CHECK ("work_activity"."status" in ('completed', 'in_progress', 'pending')),
	CONSTRAINT "work_activity_hours_check" CHECK (("work_activity"."started_at" is null) = ("work_activity"."ended_at" is null)
        and ("work_activity"."started_at" is null or "work_activity"."ended_at" >= "work_activity"."started_at"))
);
--> statement-breakpoint
ALTER TABLE "work_activity" ADD CONSTRAINT "work_activity_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_activity" ADD CONSTRAINT "work_activity_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_activity" ADD CONSTRAINT "work_activity_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_activity" ADD CONSTRAINT "work_activity_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_activity_client_date_idx" ON "work_activity" USING btree ("client_id","performed_on");--> statement-breakpoint
CREATE INDEX "work_activity_author_idx" ON "work_activity" USING btree ("author_user_id");