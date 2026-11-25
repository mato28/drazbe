CREATE TYPE "public"."property_kind" AS ENUM('APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND', 'GARAGE', 'OTHER');--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "property_kind" "property_kind" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "municipality" text;