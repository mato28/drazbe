// All business logic lives in this package (see CLAUDE.md). No framework imports here.
export * from './audit';
export * from './auth/roles';
export * from './calendar/working-days';
export * from './clock';
export * from './context';
export * from './errors';
export * from './notifications/outbox-processor';
export * from './notifications/templates';
export * from './validation/iban';
export * from './validation/tax-id';

export * from './auctions/config';
export * from './auctions/state';
export * from './bidding/eligibility';
export * from './identity/provider';
export * from './payments/bank-statement';
export * from './payments/matching';
export * from './payments/sklic';
export * from './payments/upn-qr';
export * from './registrations/statement';
export * from './validation/phone';
export * as auctionService from './auctions/service';
export * as bidderService from './bidders/service';
export * as registrationService from './registrations/service';
export * as caseService from './cases/service';
export * as documentService from './documents/service';
export * as lotService from './lots/service';
export * as publicService from './public/service';
export * from './public/rules';
export type {
  PublicAuctionDetail,
  PublicAuctionList,
  PublicAuctionSummary,
  PublicDocument,
} from './public/service';
export * from './bidding/hash';
export * from './bidding/rules';
export * as biddingService from './bidding/engine';
export * as auctionClock from './bidding/clock';
export type { BidResult, BiddingContext } from './bidding/engine';
export type { ClockOutcome } from './bidding/clock';
export { getLiveState, type LiveAuctionState, type LiveBid, type LiveViewer } from './bidding/live';
export { verifyAuction, type AuctionVerification } from './bidding/verify';
export {
  getAuctionOutcome,
  type AuctionOutcome,
  type OutcomeBid,
  type OutcomeParty,
} from './bidding/outcome';

export * from './signatures/validator';
export * from './signatures/policy';
export * from './post-auction/terms';
export { buildPain001, sepaText, type Pain001Input, type Pain001Payment } from './payments/pain001';
export {
  buildAuctionReport,
  generateAuctionReports,
  formatTimestamp,
  type ReportContext,
} from './post-auction/report';
export {
  fillContractTemplate,
  fillText,
  templatePlaceholders,
  TemplateError,
} from './post-auction/contract';
export { SALE_CONTRACT_TEMPLATE } from '../templates/sale-contract';
export * as saleService from './post-auction/sale';
export { SALE_STEPS, SignatureRejectedError, type SaleStep } from './post-auction/sale';
export * as refundService from './post-auction/refunds';
export { runSaleReminders } from './post-auction/reminders';
export {
  getBidderPostAuction,
  getTrusteePostAuction,
  type BidderPostAuctionView,
  type DepositView,
  type SaleView,
  type TrusteePostAuctionView,
} from './post-auction/views';
