ALTER TYPE "public"."document_kind" ADD VALUE 'LAND_USE_CERTIFICATE' BEFORE 'SALE_NOTICE';--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "closed_reason" text;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "auctions_one_open_per_lot" ON "auctions" USING btree ("lot_id") WHERE "auctions"."status" IN ('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED', 'LIVE', 'PREEMPTION');