CREATE TABLE "app_instance" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_instance_single_row" CHECK ("app_instance"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "app_instance" ("id") VALUES (1) ON CONFLICT DO NOTHING;
