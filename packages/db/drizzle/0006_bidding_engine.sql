ALTER TABLE "auctions" ADD COLUMN "leading_registration_id" uuid;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "preemption_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_leading_registration_id_auction_registrations_id_fk" FOREIGN KEY ("leading_registration_id") REFERENCES "public"."auction_registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_registration_idempotency_unique" UNIQUE("registration_id","idempotency_key");