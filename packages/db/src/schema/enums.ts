import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['ADMIN', 'TRUSTEE', 'BIDDER']);

export const lotType = pgEnum('lot_type', ['REAL_ESTATE']);

/** Kind of real estate, used for public filtering. */
export const propertyKind = pgEnum('property_kind', [
  'APARTMENT', // stanovanje
  'HOUSE', // hiša
  'COMMERCIAL', // poslovni prostor
  'LAND', // zemljišče
  'GARAGE', // garaža / parkirno mesto
  'OTHER',
]);

export const documentOwnerType = pgEnum('document_owner_type', [
  'TRUSTEE',
  'INSOLVENCY_CASE',
  'LOT',
  'AUCTION',
  'BIDDER_PROFILE',
  'AUCTION_REGISTRATION',
  'SALE',
]);

export const documentKind = pgEnum('document_kind', [
  'PHOTO',
  'LAND_REGISTRY_EXTRACT', // izpisek iz zemljiške knjige
  'APPRAISAL_REPORT', // cenitveno poročilo
  'ENERGY_CERTIFICATE', // energetska izkaznica
  'LAND_USE_CERTIFICATE', // potrdilo o namenski rabi zemljišča / lokacijska informacija
  'SALE_NOTICE', // razglas / oglas o prodaji
  'COURT_DECISION', // sklep sodišča (soglasje k prodaji, ...)
  'ID_DOCUMENT', // osebni dokument dražitelja
  'COMPANY_REGISTRY_EXTRACT', // izpisek iz poslovnega registra
  'POWER_OF_ATTORNEY', // pooblastilo
  'EXCLUSION_STATEMENT', // izjava o neobstoju izključitvenih razlogov
  'PREEMPTION_PROOF', // dokazilo o predkupni pravici
  'AUCTION_REPORT', // zapisnik o dražbi (full version, with identities — trustee/court only)
  'AUCTION_REPORT_PUBLIC', // zapisnik o dražbi without identities
  'SALE_CONTRACT', // prodajna pogodba (generated, unsigned)
  'SALE_CONTRACT_SIGNED_BUYER', // signed by the buyer (QES)
  'SALE_CONTRACT_SIGNED', // signed by both parties
  'SALE_CONTRACT_PAPER_SCAN', // scan of a contract signed on paper
  'REFUND_ORDER', // SEPA pain.001 for deposit refunds
  'OTHER',
]);

export const auctionType = pgEnum('auction_type', ['ASCENDING', 'DESCENDING']);

export const auctionStatus = pgEnum('auction_status', [
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_CLOSED',
  'LIVE',
  'PREEMPTION',
  'ENDED',
  'UNSUCCESSFUL',
  'CANCELLED',
]);

export const bidderType = pgEnum('bidder_type', ['PERSON', 'COMPANY']);

export const verificationStatus = pgEnum('verification_status', [
  'PENDING',
  'VERIFIED',
  'REJECTED',
]);

export const depositStatus = pgEnum('deposit_status', [
  'PENDING',
  'PAID',
  /** Auction over, this bidder did not buy: to be refunded by the trustee. */
  'REFUND_PENDING',
  'REFUNDED',
  /** Winner: the deposit counts towards the purchase price. */
  'APPLIED',
  'FORFEITED',
]);

export const registrationStatus = pgEnum('registration_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const bidKind = pgEnum('bid_kind', ['BID', 'ACCEPT', 'PREEMPTION_MATCH']);

export const notificationChannel = pgEnum('notification_channel', ['EMAIL']);

export const notificationStatus = pgEnum('notification_status', [
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
]);

/** Post-sale progress (see CLAUDE.md glossary: domik, sklep o izročitvi). */
export const saleStatus = pgEnum('sale_status', [
  'AWAITING_CONTRACT',
  'CONTRACT_SIGNED',
  'DOWN_PAYMENT_PAID',
  'PRICE_PAID',
  'TRANSFER_PROPOSED',
  'TRANSFER_ORDER_ISSUED',
  'REGISTERED',
  'DEFAULTED',
]);
