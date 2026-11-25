CREATE TYPE "public"."sale_status" AS ENUM('AWAITING_CONTRACT', 'CONTRACT_SIGNED', 'DOWN_PAYMENT_PAID', 'PRICE_PAID', 'TRANSFER_PROPOSED', 'TRANSFER_ORDER_ISSUED', 'REGISTERED', 'DEFAULTED');--> statement-breakpoint
ALTER TYPE "public"."deposit_status" ADD VALUE 'REFUND_PENDING' BEFORE 'REFUNDED';--> statement-breakpoint
ALTER TYPE "public"."deposit_status" ADD VALUE 'APPLIED' BEFORE 'FORFEITED';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'AUCTION_REPORT_PUBLIC' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'SALE_CONTRACT' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'SALE_CONTRACT_SIGNED_BUYER' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'SALE_CONTRACT_SIGNED' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'SALE_CONTRACT_PAPER_SCAN' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'REFUND_ORDER' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."document_owner_type" ADD VALUE 'SALE';--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"buyer_registration_id" uuid NOT NULL,
	"status" "sale_status" DEFAULT 'AWAITING_CONTRACT' NOT NULL,
	"price_cents" bigint NOT NULL,
	"deposit_applied_cents" bigint NOT NULL,
	"down_payment_cents" bigint NOT NULL,
	"down_payment_days" integer NOT NULL,
	"price_days" integer NOT NULL,
	"contract_deadline" timestamp with time zone NOT NULL,
	"down_payment_deadline" timestamp with time zone,
	"price_deadline" timestamp with time zone,
	"contract_doc_id" uuid,
	"buyer_signed_doc_id" uuid,
	"buyer_signature_check" jsonb,
	"signed_doc_id" uuid,
	"signed_check" jsonb,
	"signed_on_paper" boolean DEFAULT false NOT NULL,
	"contract_signed_at" timestamp with time zone,
	"down_payment_paid_at" timestamp with time zone,
	"price_paid_at" timestamp with time zone,
	"transfer_proposed_at" timestamp with time zone,
	"transfer_order_issued_at" timestamp with time zone,
	"transfer_order_ref" text,
	"registered_at" timestamp with time zone,
	"registration_ref" text,
	"defaulted_at" timestamp with time zone,
	"default_reason" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_auction_unique" UNIQUE("auction_id"),
	CONSTRAINT "sales_amounts" CHECK ("sales"."price_cents" > 0 AND "sales"."deposit_applied_cents" >= 0 AND "sales"."down_payment_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD COLUMN "refund_iban" text;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD COLUMN "refund_order_doc_id" uuid;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_buyer_registration_id_auction_registrations_id_fk" FOREIGN KEY ("buyer_registration_id") REFERENCES "public"."auction_registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_contract_doc_id_documents_id_fk" FOREIGN KEY ("contract_doc_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_buyer_signed_doc_id_documents_id_fk" FOREIGN KEY ("buyer_signed_doc_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_signed_doc_id_documents_id_fk" FOREIGN KEY ("signed_doc_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_status_index" ON "sales" USING btree ("status");--> statement-breakpoint
ALTER TABLE "auction_registrations" ADD CONSTRAINT "auction_registrations_refund_order_doc_id_documents_id_fk" FOREIGN KEY ("refund_order_doc_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;