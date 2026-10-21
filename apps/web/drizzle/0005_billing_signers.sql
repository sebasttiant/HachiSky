CREATE TABLE "billing_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"signer_profile_id" uuid,
	"data" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "billing_image_id_signer_unique" UNIQUE("id","signer_profile_id"),
	CONSTRAINT "billing_image_id_purpose_unique" UNIQUE("id","purpose"),
	CONSTRAINT "billing_image_purpose_check" CHECK ("billing_image"."purpose" in ('signature', 'issuer_logo')),
	CONSTRAINT "billing_image_owner_check" CHECK (("billing_image"."purpose" = 'signature') = ("billing_image"."signer_profile_id" is not null)),
	CONSTRAINT "billing_image_sha256_hex" CHECK ("billing_image"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "billing_image_byte_size_check" CHECK ("billing_image"."byte_size" = octet_length("billing_image"."data") and "billing_image"."byte_size" between 1 and 524288),
	CONSTRAINT "billing_image_dimensions_check" CHECK ("billing_image"."width" between 1 and 2000 and "billing_image"."height" between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "signer_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"identification_type" text NOT NULL,
	"identification_number" text NOT NULL,
	"job_title" text NOT NULL,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"current_signature_image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "signer_profile_identification_type_check" CHECK ("signer_profile"."identification_type" in ('NIT', 'CC', 'CE', 'PP')),
	CONSTRAINT "signer_profile_full_name_not_blank" CHECK (btrim("signer_profile"."full_name") <> ''),
	CONSTRAINT "signer_profile_identification_number_not_blank" CHECK (btrim("signer_profile"."identification_number") <> ''),
	CONSTRAINT "signer_profile_job_title_not_blank" CHECK (btrim("signer_profile"."job_title") <> ''),
	CONSTRAINT "signer_profile_email_not_blank" CHECK (btrim("signer_profile"."email") <> '')
);
--> statement-breakpoint
ALTER TABLE "issuer_settings" ADD COLUMN "logo_image_id" uuid;--> statement-breakpoint
ALTER TABLE "issuer_settings" ADD COLUMN "logo_image_purpose" text GENERATED ALWAYS AS ('issuer_logo') STORED;--> statement-breakpoint
ALTER TABLE "billing_image" ADD CONSTRAINT "billing_image_signer_profile_id_signer_profile_id_fk" FOREIGN KEY ("signer_profile_id") REFERENCES "public"."signer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_image" ADD CONSTRAINT "billing_image_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_profile" ADD CONSTRAINT "signer_profile_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_profile" ADD CONSTRAINT "signer_profile_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_profile" ADD CONSTRAINT "signer_profile_current_signature_fk" FOREIGN KEY ("current_signature_image_id","id") REFERENCES "public"."billing_image"("id","signer_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_image_signer_profile_idx" ON "billing_image" USING btree ("signer_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signer_profile_identification_unique" ON "signer_profile" USING btree ("identification_type","identification_number");--> statement-breakpoint
CREATE INDEX "signer_profile_active_idx" ON "signer_profile" USING btree ("active");--> statement-breakpoint
ALTER TABLE "issuer_settings" ADD CONSTRAINT "issuer_settings_logo_image_fk" FOREIGN KEY ("logo_image_id","logo_image_purpose") REFERENCES "public"."billing_image"("id","purpose") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Hand-written (drizzle-kit does not model triggers): stored image versions
-- are immutable. UPDATE and DELETE are refused with SQLSTATE 55000; owners
-- move their pointer to a new version instead.
CREATE FUNCTION "billing_image_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'billing_image versions are immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "billing_image_immutable" BEFORE UPDATE OR DELETE ON "billing_image" FOR EACH ROW EXECUTE FUNCTION "billing_image_immutable"();
