import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { cents, id, timestamps, tstz } from './_common';
import { users } from './auth';
import {
  auctionStatus,
  auctionType,
  bidderType,
  depositStatus,
  documentKind,
  documentOwnerType,
  lotType,
  propertyKind,
  registrationStatus,
  verificationStatus,
} from './enums';

// ---------------------------------------------------------------------------
// Trustees (stečajni upravitelji)
// ---------------------------------------------------------------------------
export const trustees = pgTable('trustees', {
  id: id(),
  userId: uuid()
    .notNull()
    .unique('trustees_user_id_unique')
    .references(() => users.id, { onDelete: 'restrict' }),
  name: text().notNull(),
  /** Licence number issued by the Ministry of Justice (licenca stečajnega upravitelja). */
  licenseNumber: text().notNull().unique('trustees_license_number_unique'),
  licenseIssuedOn: date({ mode: 'string' }),
  /** Firm through which the trustee operates, if any. */
  firmName: text(),
  firmRegistrationNumber: text(), // matična številka
  taxId: text(), // davčna številka
  address: text(),
  verifiedAt: tstz(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Insolvency cases (stečajni postopki)
// ---------------------------------------------------------------------------
export const insolvencyCases = pgTable(
  'insolvency_cases',
  {
    id: id(),
    trusteeId: uuid()
      .notNull()
      .references(() => trustees.id, { onDelete: 'restrict' }),
    /** e.g. "Okrožno sodišče v Ljubljani" */
    court: text().notNull(),
    /** opravilna številka, e.g. "St 1234/2025" */
    caseNumber: text().notNull(),
    debtorName: text().notNull(),
    debtorTaxId: text().notNull(),
    /** Debtor's registered seat — printed as the payee address on UPN payment orders. */
    debtorAddress: text(),
    debtorCity: text(),
    /** Debtor's estate account: deposits and purchase price are paid here, never to us. */
    estateIban: text().notNull(),
    estateBank: text().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('insolvency_cases_court_case_number_unique').on(t.court, t.caseNumber),
    index().on(t.trusteeId),
    check(
      'insolvency_cases_estate_iban_format',
      sql`${t.estateIban} ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Lots (predmeti prodaje) — MVP: real estate
// ---------------------------------------------------------------------------
export const lots = pgTable(
  'lots',
  {
    id: id(),
    caseId: uuid()
      .notNull()
      .references(() => insolvencyCases.id, { onDelete: 'restrict' }),
    type: lotType().notNull().default('REAL_ESTATE'),
    propertyKind: propertyKind().notNull().default('OTHER'),
    /** Town / municipality (kraj), used for the public location filter. */
    municipality: text(),
    title: text().notNull(),
    description: text(),
    /** Katastrska občina (k.o.), e.g. "1722 Trnovsko predmestje". */
    cadastralMunicipality: text(),
    parcelNumber: text(), // parcelna številka
    buildingId: text(), // številka stavbe
    partId: text(), // številka dela stavbe
    /** ID znak from the land registry, e.g. "1722-1234/5-0" or "1722-345-12". */
    idZnak: text(),
    areaM2: numeric({ precision: 12, scale: 2 }),
    address: text(),
    encumbrancesText: text(), // bremena / vknjižene pravice
    appraisalValueCents: cents(),
    landUse: text(), // namenska raba
    /** Agricultural land is subject to ZKZ pre-emption/approval rules. */
    isAgricultural: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index().on(t.caseId),
    check('lots_area_positive', sql`${t.areaM2} IS NULL OR ${t.areaM2} > 0`),
    check(
      'lots_appraisal_non_negative',
      sql`${t.appraisalValueCents} IS NULL OR ${t.appraisalValueCents} >= 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Documents (files in S3). Polymorphic owner, so no FK on owner_id.
// ---------------------------------------------------------------------------
export const documents = pgTable(
  'documents',
  {
    id: id(),
    ownerType: documentOwnerType().notNull(),
    ownerId: uuid().notNull(),
    kind: documentKind().notNull(),
    s3Key: text().notNull().unique('documents_s3_key_unique'),
    filename: text().notNull(),
    mime: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    sha256: char({ length: 64 }).notNull(),
    uploadedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index().on(t.ownerType, t.ownerId),
    check('documents_size_non_negative', sql`${t.sizeBytes} >= 0`),
    check('documents_sha256_hex', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

// ---------------------------------------------------------------------------
// Bidder profiles (dražitelji)
// ---------------------------------------------------------------------------
export const bidderProfiles = pgTable(
  'bidder_profiles',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .unique('bidder_profiles_user_id_unique')
      .references(() => users.id, { onDelete: 'restrict' }),
    type: bidderType().notNull(),
    /** Natural person's name, or the company's contact person. */
    fullName: text().notNull(),
    taxId: text().notNull(), // davčna številka
    // LEGAL-REVIEW: legal basis for processing EMŠO (ZVOP-2) — see docs/legal-review.md
    emso: char({ length: 13 }),
    address: text().notNull(),
    companyName: text(),
    companyRegNo: text(), // matična številka
    representativeName: text(), // zakoniti zastopnik
    /** COMPANY: is the person acting (fullName) the legal representative? If not, a PoA is required. */
    actsAsLegalRepresentative: boolean().notNull().default(true),
    /** Which IdentityProvider produced `status` (MVP: "manual" = reviewed by a trustee). */
    identityProvider: text().notNull().default('manual'),
    status: verificationStatus().notNull().default('PENDING'),
    rejectionReason: text(),
    verifiedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    check(
      'bidder_profiles_company_fields',
      sql`${t.type} <> 'COMPANY' OR (${t.companyName} IS NOT NULL AND ${t.companyRegNo} IS NOT NULL AND ${t.representativeName} IS NOT NULL)`,
    ),
    check('bidder_profiles_emso_digits', sql`${t.emso} IS NULL OR ${t.emso} ~ '^[0-9]{13}$'`),
  ],
);

// ---------------------------------------------------------------------------
// Auctions (dražbe)
// ---------------------------------------------------------------------------
export const auctions = pgTable(
  'auctions',
  {
    id: id(),
    /** Short human-readable auction number; also the first part of every deposit sklic. */
    number: bigserial({ mode: 'number' }).notNull().unique('auctions_number_unique'),
    lotId: uuid()
      .notNull()
      .references(() => lots.id, { onDelete: 'restrict' }),
    type: auctionType().notNull(),
    status: auctionStatus().notNull().default('DRAFT'),

    startingPriceCents: cents().notNull(),
    // ASCENDING
    bidIncrementCents: cents(),
    // DESCENDING
    priceDecrementCents: cents(),
    floorPriceCents: cents(),
    stepDurationSec: integer(),
    switchToAscendingOnAccept: boolean().notNull().default(false),

    startsAt: tstz().notNull(),
    endsAt: tstz(),
    extensionWindowSec: integer().notNull().default(120),
    extensionSec: integer().notNull().default(120),
    registrationDeadline: tstz().notNull(),

    depositCents: cents().notNull(),
    preemptionEnabled: boolean().notNull().default(false),
    preemptionWindowSec: integer().notNull().default(600),

    // Live state (written only by core services inside the bid transaction / worker).
    currentPriceCents: cents(),
    currentStep: integer().notNull().default(0),
    winnerBidderId: uuid().references(() => bidderProfiles.id, { onDelete: 'restrict' }),
    /** Registration currently holding the best bid (ascending leader / accepter / matching holder). */
    leadingRegistrationId: uuid().references((): AnyPgColumn => auctionRegistrations.id, {
      onDelete: 'restrict',
    }),
    /** DESCENDING: when the current price was accepted (switch-to-ascending continues after). */
    acceptedAt: tstz(),
    /** End of the PREEMPTION phase (set when the phase opens). */
    preemptionEndsAt: tstz(),
    /** Deposits / sale record / emails were processed after the auction closed. */
    settledAt: tstz(),

    publishedAt: tstz(),
    /** Reference to the court's consent to the sale (soglasje sodišča k prodaji). */
    courtApprovalRef: text(),
    /** Reason given by the trustee when the auction was cancelled or stopped. */
    closedReason: text(),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index().on(t.lotId),
    // A lot can have at most one auction that is not finished (repeat auctions come after).
    uniqueIndex('auctions_one_open_per_lot')
      .on(t.lotId)
      .where(
        sql`${t.status} IN ('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED', 'LIVE', 'PREEMPTION')`,
      ),
    index().on(t.status, t.startsAt),
    check('auctions_starting_price_positive', sql`${t.startingPriceCents} > 0`),
    check('auctions_deposit_non_negative', sql`${t.depositCents} >= 0`),
    check(
      'auctions_ascending_fields',
      sql`${t.type} <> 'ASCENDING' OR (${t.bidIncrementCents} IS NOT NULL AND ${t.bidIncrementCents} > 0 AND ${t.endsAt} IS NOT NULL)`,
    ),
    check(
      'auctions_descending_fields',
      sql`${t.type} <> 'DESCENDING' OR (
        ${t.priceDecrementCents} IS NOT NULL AND ${t.priceDecrementCents} > 0
        AND ${t.floorPriceCents} IS NOT NULL AND ${t.floorPriceCents} > 0
        AND ${t.floorPriceCents} <= ${t.startingPriceCents}
        AND ${t.stepDurationSec} IS NOT NULL AND ${t.stepDurationSec} > 0
        AND (${t.switchToAscendingOnAccept} = false OR (${t.bidIncrementCents} IS NOT NULL AND ${t.bidIncrementCents} > 0))
      )`,
    ),
    check('auctions_ends_after_start', sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
    check('auctions_registration_before_start', sql`${t.registrationDeadline} <= ${t.startsAt}`),
    check(
      'auctions_timing_positive',
      sql`${t.extensionWindowSec} >= 0 AND ${t.extensionSec} >= 0 AND ${t.preemptionWindowSec} > 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Auction registrations (prijave na dražbo)
// ---------------------------------------------------------------------------
export const auctionRegistrations = pgTable(
  'auction_registrations',
  {
    id: id(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id, { onDelete: 'restrict' }),
    bidderId: uuid()
      .notNull()
      .references(() => bidderProfiles.id, { onDelete: 'restrict' }),
    /** 1-based order of registration within the auction; drives the pseudonym and the sklic. */
    seq: integer().notNull(),
    /** Shown to other bidders instead of the identity, e.g. "Dražitelj 3". */
    pseudonym: text().notNull(),
    /** Sklic (SI00 model), unique per bidder + auction. */
    paymentReference: text().notNull().unique('auction_registrations_payment_reference_unique'),
    depositStatus: depositStatus().notNull().default('PENDING'),
    depositPaidAt: tstz(),
    depositMarkedBy: uuid().references(() => users.id, { onDelete: 'restrict' }),
    /** How the payment was established (manual note or matched bank transaction). */
    depositNote: text(),
    statementSignedDocId: uuid().references(() => documents.id, { onDelete: 'restrict' }),
    /** Bidder's account for the deposit refund (entered by the bidder or taken from the payment). */
    refundIban: text(),
    refundedAt: tstz(),
    /** The pain.001 refund order this deposit was included in. */
    refundOrderDocId: uuid().references(() => documents.id, { onDelete: 'restrict' }),
    isPreemptionHolder: boolean().notNull().default(false),
    // LEGAL-REVIEW: ordering of multiple pre-emption holders — see docs/legal-review.md
    preemptionRank: integer(),
    status: registrationStatus().notNull().default('PENDING'),
    approvedBy: uuid().references(() => users.id, { onDelete: 'restrict' }),
    approvedAt: tstz(),
    rejectionReason: text(),
    ...timestamps,
  },
  (t) => [
    unique('auction_registrations_auction_seq_unique').on(t.auctionId, t.seq),
    unique('auction_registrations_auction_bidder_unique').on(t.auctionId, t.bidderId),
    unique('auction_registrations_auction_pseudonym_unique').on(t.auctionId, t.pseudonym),
    index().on(t.bidderId),
    check(
      'auction_registrations_preemption_rank',
      sql`(${t.isPreemptionHolder} AND ${t.preemptionRank} IS NOT NULL AND ${t.preemptionRank} > 0)
        OR (NOT ${t.isPreemptionHolder} AND ${t.preemptionRank} IS NULL)`,
    ),
    check(
      'auction_registrations_approval',
      sql`${t.status} <> 'APPROVED' OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`,
    ),
  ],
);
