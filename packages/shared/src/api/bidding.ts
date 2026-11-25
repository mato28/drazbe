import { z } from 'zod';
import { AUCTION_STATUSES, AUCTION_TYPES } from './auctions';
import { centsString } from './common';

export const BID_KINDS = ['BID', 'ACCEPT', 'PREEMPTION_MATCH'] as const;
export type BidKind = (typeof BID_KINDS)[number];
export const BID_KIND_LABEL: Record<BidKind, string> = {
  BID: 'Ponudba',
  ACCEPT: 'Sprejem cene',
  PREEMPTION_MATCH: 'Predkupna pravica',
};

const idempotencyKey = z.uuid({ error: 'Manjka ključ zahteve.' });

/** POST /api/auctions/:id/bids */
export const placeBidSchema = z.object({
  amountCents: centsString,
  idempotencyKey,
});
export type PlaceBidInput = z.infer<typeof placeBidSchema>;

/** POST /api/auctions/:id/accept and /api/auctions/:id/preemption-match */
export const priceCommandSchema = z.object({
  /** The price shown to the bidder when they confirmed. */
  expectedPriceCents: centsString,
  idempotencyKey,
});
export type PriceCommandInput = z.infer<typeof priceCommandSchema>;

const cents = z.string().regex(/^\d+$/);
const instant = z.iso.datetime();

export const liveBidDtoSchema = z.object({
  seq: z.number().int(),
  pseudonym: z.string(),
  amountCents: cents,
  kind: z.enum(BID_KINDS),
  serverTime: instant,
});
export type LiveBidDto = z.infer<typeof liveBidDtoSchema>;

export const bidResultDtoSchema = z.object({
  bid: liveBidDtoSchema.extend({ hash: z.string() }),
  duplicate: z.boolean(),
  auction: z.object({
    status: z.enum(AUCTION_STATUSES),
    endsAt: instant.nullable(),
    extended: z.boolean(),
  }),
});
export type BidResultDto = z.infer<typeof bidResultDtoSchema>;

/** Snapshot of a running auction: GET /api/auctions/:id/live and every SSE "state" event. */
export const liveAuctionStateDtoSchema = z.object({
  auctionId: z.uuid(),
  type: z.enum(AUCTION_TYPES),
  status: z.enum(AUCTION_STATUSES),
  mode: z.enum(AUCTION_TYPES),
  serverTime: instant,
  startsAt: instant,
  endsAt: instant.nullable(),
  startingPriceCents: cents,
  currentPriceCents: cents.nullable(),
  minimumBidCents: cents.nullable(),
  bidIncrementCents: cents.nullable(),
  nextStepAt: instant.nullable(),
  nextPriceCents: cents.nullable(),
  floorPriceCents: cents.nullable(),
  preemptionEndsAt: instant.nullable(),
  leaderPseudonym: z.string().nullable(),
  bidCount: z.number().int(),
  bids: z.array(liveBidDtoSchema),
  closedReason: z.string().nullable(),
  viewer: z
    .object({
      pseudonym: z.string(),
      approved: z.boolean(),
      isLeading: z.boolean(),
      isPreemptionHolder: z.boolean(),
      canMatch: z.boolean(),
    })
    .nullable(),
});
export type LiveAuctionStateDto = z.infer<typeof liveAuctionStateDtoSchema>;

/** GET /api/time — for estimating the client's clock offset. */
export const serverTimeDtoSchema = z.object({ serverTime: instant });
export type ServerTimeDto = z.infer<typeof serverTimeDtoSchema>;

/** Names of the server-sent events on /api/auctions/:id/stream. */
export const AUCTION_STREAM_EVENTS = { state: 'state', error: 'error' } as const;
