CREATE TABLE "declaration_text" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "declaration_text_label_check" CHECK (btrim("declaration_text"."label") <> '' and char_length("declaration_text"."label") <= 120),
	CONSTRAINT "declaration_text_body_check" CHECK (btrim("declaration_text"."body", E' \t\r\n') <> '' and char_length("declaration_text"."body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "declaration_text" ADD CONSTRAINT "declaration_text_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_text" ADD CONSTRAINT "declaration_text_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "declaration_text_label_unique" ON "declaration_text" USING btree (lower("label"));--> statement-breakpoint
CREATE INDEX "declaration_text_active_idx" ON "declaration_text" USING btree ("active");