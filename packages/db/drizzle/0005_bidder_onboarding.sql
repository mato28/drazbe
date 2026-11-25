ALTER TABLE "auction_registrations" ADD COLUMN "seq" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD COLUMN "deposit_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD COLUMN "deposit_marked_by" uuid;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD COLUMN "deposit_note" text;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "number" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "bidder_profiles" ADD COLUMN "acts_as_legal_representative" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bidder_profiles" ADD COLUMN "identity_provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "bidder_profiles" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "insolvency_cases" ADD COLUMN "debtor_address" text;--> statement-breakpoint
ALTER TABLE "insolvency_cases" ADD COLUMN "debtor_city" text;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_deposit_marked_by_users_id_fk" FOREIGN KEY ("deposit_marked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_auction_seq_unique" UNIQUE("auction_id","seq");--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_number_unique" UNIQUE("number");--> statement-breakpoint
-- Auction numbers start at 1001 so the sklic never looks like a test value.
ALTER SEQUENCE "auctions_number_seq" RESTART WITH 1001;
