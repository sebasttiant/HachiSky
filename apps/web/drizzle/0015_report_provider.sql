ALTER TABLE "report" ADD COLUMN "issuer_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "signer_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "detail_level" text DEFAULT 'detailed' NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_issuer_profile_fk" FOREIGN KEY ("issuer_profile_id") REFERENCES "public"."issuer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_signer_profile_fk" FOREIGN KEY ("signer_profile_id") REFERENCES "public"."signer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_detail_level_check" CHECK ("report"."detail_level" in ('detailed', 'summary'));--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "provider_name" text;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "provider_logo_image_id" uuid;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "signer_name" text;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "signer_identification_type" text;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "signer_identification_number" text;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "signer_job_title" text;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "signer_signature_image_id" uuid;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD COLUMN "detail_level" text DEFAULT 'detailed' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD CONSTRAINT "report_issued_version_provider_logo_fk" FOREIGN KEY ("provider_logo_image_id") REFERENCES "public"."billing_image"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD CONSTRAINT "report_issued_version_signer_signature_fk" FOREIGN KEY ("signer_signature_image_id") REFERENCES "public"."billing_image"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issued_version" ADD CONSTRAINT "report_issued_detail_level_check" CHECK ("report_issued_version"."detail_level" in ('detailed', 'summary'));
