ALTER TABLE "billing_document" DROP CONSTRAINT "billing_document_status_check";--> statement-breakpoint
ALTER TABLE "billing_document" ADD COLUMN "consecutive" integer;--> statement-breakpoint
ALTER TABLE "billing_document" ADD COLUMN "issued_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_document_consecutive_unique" ON "billing_document" USING btree ("issuer_profile_id","consecutive") WHERE "billing_document"."consecutive" is not null;--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_consecutive_check" CHECK ("billing_document"."consecutive" is null or "billing_document"."consecutive" between 1 and 99999999);--> statement-breakpoint
ALTER TABLE "billing_document" ADD CONSTRAINT "billing_document_status_check" CHECK ("billing_document"."status" in ('draft', 'issued'));