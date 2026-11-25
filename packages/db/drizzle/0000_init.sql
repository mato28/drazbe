CREATE TYPE "public"."auction_status" AS ENUM('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED', 'LIVE', 'PREEMPTION', 'ENDED', 'UNSUCCESSFUL', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."auction_type" AS ENUM('ASCENDING', 'DESCENDING');--> statement-breakpoint
CREATE TYPE "public"."bid_kind" AS ENUM('BID', 'ACCEPT', 'PREEMPTION_MATCH');--> statement-breakpoint
CREATE TYPE "public"."bidder_type" AS ENUM('PERSON', 'COMPANY');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('PENDING', 'PAID', 'REFUNDED', 'FORFEITED');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('PHOTO', 'LAND_REGISTRY_EXTRACT', 'APPRAISAL_REPORT', 'ENERGY_CERTIFICATE', 'SALE_NOTICE', 'COURT_DECISION', 'ID_DOCUMENT', 'COMPANY_REGISTRY_EXTRACT', 'POWER_OF_ATTORNEY', 'EXCLUSION_STATEMENT', 'PREEMPTION_PROOF', 'AUCTION_REPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."document_owner_type" AS ENUM('TRUSTEE', 'INSOLVENCY_CASE', 'LOT', 'AUCTION', 'BIDDER_PROFILE', 'AUCTION_REGISTRATION');--> statement-breakpoint
CREATE TYPE "public"."lot_type" AS ENUM('REAL_ESTATE');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('EMAIL');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'TRUSTEE', 'BIDDER');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"role" "user_role" DEFAULT 'BIDDER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"bidder_id" uuid NOT NULL,
	"pseudonym" text NOT NULL,
	"payment_reference" text NOT NULL,
	"deposit_status" "deposit_status" DEFAULT 'PENDING' NOT NULL,
	"statement_signed_doc_id" uuid,
	"is_preemption_holder" boolean DEFAULT false NOT NULL,
	"preemption_rank" integer,
	"status" "registration_status" DEFAULT 'PENDING' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auction_registrations_payment_reference_unique" UNIQUE("payment_reference"),
	CONSTRAINT "auction_registrations_auction_bidder_unique" UNIQUE("auction_id","bidder_id"),
	CONSTRAINT "auction_registrations_auction_pseudonym_unique" UNIQUE("auction_id","pseudonym"),
	CONSTRAINT "auction_registrations_preemption_rank" CHECK (("auction_registrations"."is_preemption_holder" AND "auction_registrations"."preemption_rank" IS NOT NULL AND "auction_registrations"."preemption_rank" > 0)
        OR (NOT "auction_registrations"."is_preemption_holder" AND "auction_registrations"."preemption_rank" IS NULL)),
	CONSTRAINT "auction_registrations_approval" CHECK ("auction_registrations"."status" <> 'APPROVED' OR ("auction_registrations"."approved_by" IS NOT NULL AND "auction_registrations"."approved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"type" "auction_type" NOT NULL,
	"status" "auction_status" DEFAULT 'DRAFT' NOT NULL,
	"starting_price_cents" bigint NOT NULL,
	"bid_increment_cents" bigint,
	"price_decrement_cents" bigint,
	"floor_price_cents" bigint,
	"step_duration_sec" integer,
	"switch_to_ascending_on_accept" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"extension_window_sec" integer DEFAULT 120 NOT NULL,
	"extension_sec" integer DEFAULT 120 NOT NULL,
	"registration_deadline" timestamp with time zone NOT NULL,
	"deposit_cents" bigint NOT NULL,
	"preemption_enabled" boolean DEFAULT false NOT NULL,
	"preemption_window_sec" integer DEFAULT 600 NOT NULL,
	"current_price_cents" bigint,
	"current_step" integer DEFAULT 0 NOT NULL,
	"winner_bidder_id" uuid,
	"published_at" timestamp with time zone,
	"court_approval_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auctions_starting_price_positive" CHECK ("auctions"."starting_price_cents" > 0),
	CONSTRAINT "auctions_deposit_non_negative" CHECK ("auctions"."deposit_cents" >= 0),
	CONSTRAINT "auctions_ascending_fields" CHECK ("auctions"."type" <> 'ASCENDING' OR ("auctions"."bid_increment_cents" IS NOT NULL AND "auctions"."bid_increment_cents" > 0 AND "auctions"."ends_at" IS NOT NULL)),
	CONSTRAINT "auctions_descending_fields" CHECK ("auctions"."type" <> 'DESCENDING' OR (
        "auctions"."price_decrement_cents" IS NOT NULL AND "auctions"."price_decrement_cents" > 0
        AND "auctions"."floor_price_cents" IS NOT NULL AND "auctions"."floor_price_cents" > 0
        AND "auctions"."floor_price_cents" <= "auctions"."starting_price_cents"
        AND "auctions"."step_duration_sec" IS NOT NULL AND "auctions"."step_duration_sec" > 0
        AND ("auctions"."switch_to_ascending_on_accept" = false OR ("auctions"."bid_increment_cents" IS NOT NULL AND "auctions"."bid_increment_cents" > 0))
      )),
	CONSTRAINT "auctions_ends_after_start" CHECK ("auctions"."ends_at" IS NULL OR "auctions"."ends_at" > "auctions"."starts_at"),
	CONSTRAINT "auctions_registration_before_start" CHECK ("auctions"."registration_deadline" <= "auctions"."starts_at"),
	CONSTRAINT "auctions_timing_positive" CHECK ("auctions"."extension_window_sec" >= 0 AND "auctions"."extension_sec" >= 0 AND "auctions"."preemption_window_sec" > 0)
);
--> statement-breakpoint
CREATE TABLE "bidder_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "bidder_type" NOT NULL,
	"full_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"emso" char(13),
	"address" text NOT NULL,
	"company_name" text,
	"company_reg_no" text,
	"representative_name" text,
	"status" "verification_status" DEFAULT 'PENDING' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bidder_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "bidder_profiles_company_fields" CHECK ("bidder_profiles"."type" <> 'COMPANY' OR ("bidder_profiles"."company_name" IS NOT NULL AND "bidder_profiles"."company_reg_no" IS NOT NULL AND "bidder_profiles"."representative_name" IS NOT NULL)),
	CONSTRAINT "bidder_profiles_emso_digits" CHECK ("bidder_profiles"."emso" IS NULL OR "bidder_profiles"."emso" ~ '^[0-9]{13}$')
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "document_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" char(64) NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_s3_key_unique" UNIQUE("s3_key"),
	CONSTRAINT "documents_size_non_negative" CHECK ("documents"."size_bytes" >= 0),
	CONSTRAINT "documents_sha256_hex" CHECK ("documents"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "insolvency_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trustee_id" uuid NOT NULL,
	"court" text NOT NULL,
	"case_number" text NOT NULL,
	"debtor_name" text NOT NULL,
	"debtor_tax_id" text NOT NULL,
	"estate_iban" text NOT NULL,
	"estate_bank" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insolvency_cases_court_case_number_unique" UNIQUE("court","case_number"),
	CONSTRAINT "insolvency_cases_estate_iban_format" CHECK ("insolvency_cases"."estate_iban" ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$')
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" "lot_type" DEFAULT 'REAL_ESTATE' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cadastral_municipality" text,
	"parcel_number" text,
	"building_id" text,
	"part_id" text,
	"id_znak" text,
	"area_m_2" numeric(12, 2),
	"address" text,
	"encumbrances_text" text,
	"appraisal_value_cents" bigint,
	"land_use" text,
	"is_agricultural" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_area_positive" CHECK ("lots"."area_m_2" IS NULL OR "lots"."area_m_2" > 0),
	CONSTRAINT "lots_appraisal_non_negative" CHECK ("lots"."appraisal_value_cents" IS NULL OR "lots"."appraisal_value_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trustees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"license_number" text NOT NULL,
	"license_issued_on" date,
	"firm_name" text,
	"firm_registration_number" text,
	"tax_id" text,
	"address" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trustees_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "trustees_license_number_unique" UNIQUE("license_number")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"kind" "bid_kind" DEFAULT 'BID' NOT NULL,
	"server_time" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" char(64) NOT NULL,
	"hash" char(64) NOT NULL,
	"tsa_token" text,
	CONSTRAINT "bids_hash_unique" UNIQUE("hash"),
	CONSTRAINT "bids_auction_seq_unique" UNIQUE("auction_id","seq"),
	CONSTRAINT "bids_seq_positive" CHECK ("bids"."seq" > 0),
	CONSTRAINT "bids_amount_positive" CHECK ("bids"."amount_cents" > 0),
	CONSTRAINT "bids_hash_hex" CHECK ("bids"."hash" ~ '^[0-9a-f]{64}$' AND "bids"."prev_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "notifications_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notification_channel" DEFAULT 'EMAIL' NOT NULL,
	"template" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_bidder_id_bidder_profiles_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."bidder_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_statement_signed_doc_id_documents_id_fk" FOREIGN KEY ("statement_signed_doc_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_winner_bidder_id_bidder_profiles_id_fk" FOREIGN KEY ("winner_bidder_id") REFERENCES "public"."bidder_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidder_profiles" ADD CONSTRAINT "bidder_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidder_profiles" ADD CONSTRAINT "bidder_profiles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insolvency_cases" ADD CONSTRAINT "insolvency_cases_trustee_id_trustees_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_case_id_insolvency_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."insolvency_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustees" ADD CONSTRAINT "trustees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_registration_id_auction_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."auction_registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_index" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "auction_registrations_bidder_id_index" ON "auction_registrations" USING btree ("bidder_id");--> statement-breakpoint
CREATE INDEX "auctions_lot_id_index" ON "auctions" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "auctions_status_starts_at_index" ON "auctions" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "documents_owner_type_owner_id_index" ON "documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "insolvency_cases_trustee_id_index" ON "insolvency_cases" USING btree ("trustee_id");--> statement-breakpoint
CREATE INDEX "lots_case_id_index" ON "lots" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_index" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_index" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "bids_registration_id_index" ON "bids" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "notifications_outbox_status_available_at_index" ON "notifications_outbox" USING btree ("status","available_at");