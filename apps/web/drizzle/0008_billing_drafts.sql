CREATE TABLE "billing_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"client_id" uuid NOT NULL,
	"issuer_profile_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"bank_account_id" uuid,
	"signer_profile_id" uuid,
	"declaration_text_id" uuid,
	"payment_terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "billing_document_status_check" CHECK ("billing_document"."status" in ('draft')),
	CONSTRAINT "billing_document_currency_check" CHECK ("billing_document"."currency" in ('COP', 'USD')),
	CONSTRAINT "billing_document_payment_terms_length" CHECK (char_length("billing_document"."payment_terms") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "billing_document_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"product" text NOT NULL,
	"description" text,
	"quantity" text,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "billing_document_line_position_unique" UNIQUE("document_id","position"),
	CONSTRAINT "billing_document_line_position_check" CHECK ("billing_document_line"."position" between 1 and 50),
	CONSTRAINT "billing_document_line_product_check" CHECK (btrim("billing_document_line"."product") <> '' and char_length("billing_document_line"."product") <= 200),
	CONSTRAINT "billing_document_line_description_length" CHECK (char_length("billing_document_line"."description") <= 1000),
	CONSTRAINT "billing_document_line_quantity_length" CHECK (char_length("billing_document_line"."quantity") <= 30),
	CONSTRAINT "billing_document_line_amount_check" CHECK ("billing_document_line"."amount_minor" between 1 and 99999999999999)
);
--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_issuer_profile_id_issuer_profile_id_fk" FOREIGN KEY ("issuer_profile_id") REFERENCES "public"."issuer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_signer_profile_id_signer_profile_id_fk" FOREIGN KEY ("signer_profile_id") REFERENCES "public"."signer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_declaration_text_id_declaration_text_id_fk" FOREIGN KEY ("declaration_text_id") REFERENCES "public"."declaration_text"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document_line" ADD CONSTRAINT "billing_document_line_document_id_billing_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."billing_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_document_status_idx" ON "billing_document" USING btree ("status");--> statement-breakpoint
CREATE INDEX "billing_document_client_idx" ON "billing_document" USING btree ("client_id");