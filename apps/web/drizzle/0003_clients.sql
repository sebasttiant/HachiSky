CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"identification_type" text NOT NULL,
	"identification_number" text NOT NULL,
	"address" text,
	"city" text,
	"email" text,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "client_identification_unique" UNIQUE("identification_type","identification_number"),
	CONSTRAINT "client_identification_type_check" CHECK ("client"."identification_type" in ('NIT', 'CC', 'CE', 'PP')),
	CONSTRAINT "client_name_not_blank" CHECK (btrim("client"."name") <> ''),
	CONSTRAINT "client_identification_number_not_blank" CHECK (btrim("client"."identification_number") <> '')
);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_name_idx" ON "client" USING btree ("name");--> statement-breakpoint
CREATE INDEX "client_active_idx" ON "client" USING btree ("active");