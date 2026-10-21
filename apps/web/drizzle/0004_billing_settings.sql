CREATE TABLE "bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"account_type" text NOT NULL,
	"account_number" text NOT NULL,
	"holder_name" text NOT NULL,
	"holder_identification_type" text NOT NULL,
	"holder_identification_number" text NOT NULL,
	"currency" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "bank_account_account_type_check" CHECK ("bank_account"."account_type" in ('ahorros', 'corriente')),
	CONSTRAINT "bank_account_currency_check" CHECK ("bank_account"."currency" in ('COP', 'USD')),
	CONSTRAINT "bank_account_holder_identification_type_check" CHECK ("bank_account"."holder_identification_type" in ('NIT', 'CC', 'CE', 'PP')),
	CONSTRAINT "bank_account_bank_name_not_blank" CHECK (btrim("bank_account"."bank_name") <> ''),
	CONSTRAINT "bank_account_holder_name_not_blank" CHECK (btrim("bank_account"."holder_name") <> ''),
	CONSTRAINT "bank_account_holder_identification_number_not_blank" CHECK (btrim("bank_account"."holder_identification_number") <> ''),
	CONSTRAINT "bank_account_account_number_digits" CHECK ("bank_account"."account_number" ~ '^[0-9]{4,20}$')
);
--> statement-breakpoint
CREATE TABLE "issuer_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text NOT NULL,
	"identification_type" text NOT NULL,
	"identification_number" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"phone" text,
	"email" text,
	"payment_terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "issuer_settings_singleton" CHECK ("issuer_settings"."id" = 1),
	CONSTRAINT "issuer_settings_identification_type_check" CHECK ("issuer_settings"."identification_type" in ('NIT', 'CC', 'CE', 'PP')),
	CONSTRAINT "issuer_settings_legal_name_not_blank" CHECK (btrim("issuer_settings"."legal_name") <> ''),
	CONSTRAINT "issuer_settings_identification_number_not_blank" CHECK (btrim("issuer_settings"."identification_number") <> ''),
	CONSTRAINT "issuer_settings_address_not_blank" CHECK (btrim("issuer_settings"."address") <> ''),
	CONSTRAINT "issuer_settings_city_not_blank" CHECK (btrim("issuer_settings"."city") <> ''),
	CONSTRAINT "issuer_settings_payment_terms_length" CHECK (char_length("issuer_settings"."payment_terms") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_settings" ADD CONSTRAINT "issuer_settings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_settings" ADD CONSTRAINT "issuer_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_bank_number_currency_unique" ON "bank_account" USING btree (lower("bank_name"),"account_number","currency");--> statement-breakpoint
CREATE INDEX "bank_account_active_idx" ON "bank_account" USING btree ("active");