CREATE TABLE "issuer_logo" (
	"image_id" uuid NOT NULL,
	"image_purpose" text GENERATED ALWAYS AS ('issuer_logo') STORED,
	"issuer_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuer_logo_pkey" PRIMARY KEY("image_id"),
	CONSTRAINT "issuer_logo_image_issuer_unique" UNIQUE("image_id","issuer_profile_id")
);
--> statement-breakpoint
CREATE TABLE "issuer_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"identification_type" text NOT NULL,
	"identification_number" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"phone" text,
	"email" text,
	"payment_terms" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"current_logo_image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "issuer_profile_default_is_active" CHECK (not "issuer_profile"."is_default" or "issuer_profile"."active"),
	CONSTRAINT "issuer_profile_identification_type_check" CHECK ("issuer_profile"."identification_type" in ('NIT', 'CC', 'CE', 'PP')),
	CONSTRAINT "issuer_profile_legal_name_not_blank" CHECK (btrim("issuer_profile"."legal_name") <> ''),
	CONSTRAINT "issuer_profile_identification_number_not_blank" CHECK (btrim("issuer_profile"."identification_number") <> ''),
	CONSTRAINT "issuer_profile_address_not_blank" CHECK (btrim("issuer_profile"."address") <> ''),
	CONSTRAINT "issuer_profile_city_not_blank" CHECK (btrim("issuer_profile"."city") <> ''),
	CONSTRAINT "issuer_profile_payment_terms_length" CHECK (char_length("issuer_profile"."payment_terms") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "issuer_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "issuer_logo" ADD CONSTRAINT "issuer_logo_issuer_profile_id_issuer_profile_id_fk" FOREIGN KEY ("issuer_profile_id") REFERENCES "public"."issuer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_logo" ADD CONSTRAINT "issuer_logo_image_fk" FOREIGN KEY ("image_id","image_purpose") REFERENCES "public"."billing_image"("id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_profile" ADD CONSTRAINT "issuer_profile_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_profile" ADD CONSTRAINT "issuer_profile_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_profile" ADD CONSTRAINT "issuer_profile_current_logo_fk" FOREIGN KEY ("current_logo_image_id","id") REFERENCES "public"."issuer_logo"("image_id","issuer_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issuer_logo_issuer_profile_idx" ON "issuer_logo" USING btree ("issuer_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issuer_profile_identification_unique" ON "issuer_profile" USING btree ("identification_type","identification_number");--> statement-breakpoint
CREATE UNIQUE INDEX "issuer_profile_single_default" ON "issuer_profile" USING btree ("is_default") WHERE "issuer_profile"."is_default";--> statement-breakpoint
CREATE INDEX "issuer_profile_active_idx" ON "issuer_profile" USING btree ("active");--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_issuer_profile_id_issuer_profile_id_fk" FOREIGN KEY ("issuer_profile_id") REFERENCES "public"."issuer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_account_issuer_profile_idx" ON "bank_account" USING btree ("issuer_profile_id");--> statement-breakpoint
-- Hand-written (drizzle-kit does not model triggers): logo ownership rows are
-- immutable, like the billing_image versions they point at. UPDATE and
-- DELETE are refused with SQLSTATE 55000.
CREATE FUNCTION "issuer_logo_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'issuer_logo rows are immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "issuer_logo_immutable" BEFORE UPDATE OR DELETE ON "issuer_logo" FOR EACH ROW EXECUTE FUNCTION "issuer_logo_immutable"();--> statement-breakpoint
-- Hand-written data steps. The single issuer_settings row (if any) becomes
-- the default, active profile with the same data, timestamps and users.
-- Only unambiguous links are made: with that row present there was exactly
-- one issuer, so every stored issuer logo version and every bank account
-- belonged to it. Without it nothing is invented: no profile is created,
-- stored logos stay unowned and bank accounts stay unassigned (reported by
-- the app, never guessed). billing_image rows are never updated.
INSERT INTO "issuer_profile" ("legal_name", "identification_type", "identification_number", "address", "city", "phone", "email", "payment_terms", "active", "is_default", "created_at", "updated_at", "created_by", "updated_by")
SELECT "legal_name", "identification_type", "identification_number", "address", "city", "phone", "email", "payment_terms", true, true, "created_at", "updated_at", "created_by", "updated_by"
FROM "issuer_settings" WHERE "id" = 1;--> statement-breakpoint
INSERT INTO "issuer_logo" ("image_id", "issuer_profile_id", "created_at")
SELECT "billing_image"."id", "issuer_profile"."id", "billing_image"."created_at"
FROM "billing_image" CROSS JOIN "issuer_profile"
WHERE "billing_image"."purpose" = 'issuer_logo' AND "issuer_profile"."is_default";--> statement-breakpoint
UPDATE "issuer_profile" SET "current_logo_image_id" = "issuer_settings"."logo_image_id"
FROM "issuer_settings"
WHERE "issuer_profile"."is_default" AND "issuer_settings"."id" = 1 AND "issuer_settings"."logo_image_id" IS NOT NULL;--> statement-breakpoint
UPDATE "bank_account" SET "issuer_profile_id" = "issuer_profile"."id"
FROM "issuer_profile"
WHERE "issuer_profile"."is_default";--> statement-breakpoint
DROP TABLE "issuer_settings";
