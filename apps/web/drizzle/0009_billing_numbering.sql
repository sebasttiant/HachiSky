CREATE TABLE "billing_numbering" (
	"issuer_profile_id" uuid PRIMARY KEY NOT NULL,
	"next_number" integer NOT NULL,
	"last_registered" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "billing_numbering_next_number_check" CHECK ("billing_numbering"."next_number" between 1 and 99999999),
	CONSTRAINT "billing_numbering_last_registered_check" CHECK ("billing_numbering"."last_registered" is null or "billing_numbering"."last_registered" between 1 and 99999999),
	CONSTRAINT "billing_numbering_forward_check" CHECK ("billing_numbering"."last_registered" is null or "billing_numbering"."next_number" > "billing_numbering"."last_registered")
);
--> statement-breakpoint
ALTER TABLE "billing_numbering" ADD CONSTRAINT "billing_numbering_issuer_profile_id_issuer_profile_id_fk" FOREIGN KEY ("issuer_profile_id") REFERENCES "public"."issuer_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_numbering" ADD CONSTRAINT "billing_numbering_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_numbering" ADD CONSTRAINT "billing_numbering_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;