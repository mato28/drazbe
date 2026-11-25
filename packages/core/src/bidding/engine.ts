import type {
  AuctionRegistrationRow,
  AuctionRow,
  BidRow,
  BidderProfileRow,
  Repositories,
} from '@domik/db';
import { type BidKind, formatCents } from '@domik/shared';
import { type Actor, type ServiceContext } from '../context';
import { DomainError, notFound } from '../errors';
import { assertEligible } from './eligibility';
import { bidHash, genesisHash } from './hash';
import {
  bidAmountError,
  continuationEndsAt,
  descendingStepAt,
  eligiblePreemptionHolders,
  extendedEndsAt,
  isAscendingMode,
} from './rules';
import { applyDescendingStep, closeMainPhase, closePreemption } from './transitions';

/** The engine needs only persistence and server time. */
export type BiddingContext = Pick<ServiceContext, 'uow' | 'clock' | 'appUrl'>;

export interface BidCommand {
  amountCents: bigint;
  /** Client-generated per submit; a retry with the same key returns the original result. */
  idempotencyKey: string;
}

export interface PriceCommand {
  /** The price the bidder saw and confirmed; must equal the current price. */
  expectedPriceCents: bigint;
  idempotencyKey: string;
}

export interface BidResult {
  bid: {
    id: string;
    seq: number;
    kind: BidKind;
    amountCents: bigint;
    serverTime: Date;
    pseudonym: string;
    hash: string;
  };
  /** The same idempotency key was already used: nothing new was recorded. */
  duplicate: boolean;
  auction: { status: AuctionRow['status']; endsAt: Date | null; extended: boolean };
}

interface Bidder {
  profile: BidderProfileRow;
  registration: AuctionRegistrationRow;
}

async function loadBidder(tx: Repositories, actor: Actor, auctionId: string): Promise<Bidder> {
  if (actor.role !== 'BIDDER') {
    throw new DomainError('FORBIDDEN', 'Na dražbi lahko sodelujejo samo dražitelji.');
  }
  const profile = await tx.bidderProfiles.findByUserId(actor.userId);
  if (!profile) throw new DomainError('FORBIDDEN', 'Na to dražbo niste prijavljeni.');
  const registration = await tx.auctionRegistrations.findByAuctionAndBidder(auctionId, profile.id);
  assertEligible(profile, registration);
  return { profile, registration };
}

/**
 * Opens the bid transaction: locks the auction row (`SELECT ... FOR UPDATE`) so that every bid
 * and clock transition of this auction is serialized, then checks the bidder inside it.
 */
async function lockForBid(tx: Repositories, actor: Actor, auctionId: string) {
  const auction = await tx.auctions.lockById(auctionId);
  if (!auction || auction.status === 'DRAFT' || auction.publishedAt === null) {
    throw notFound('Dražba');
  }
  const bidder = await loadBidder(tx, actor, auctionId);
  return { auction, ...bidder };
}

function replay(
  existing: BidRow,
  registration: AuctionRegistrationRow,
  auction: AuctionRow,
  kind: BidKind,
  amountCents: bigint | null,
): BidResult {
  if (existing.kind !== kind || (amountCents !== null && existing.amountCents !== amountCents)) {
    throw new DomainError(
      'CONFLICT',
      'Ta zahteva je bila že uporabljena za drugo ponudbo. Osvežite stran in poskusite znova.',
    );
  }
  return {
    bid: { ...existing, pseudonym: registration.pseudonym },
    duplicate: true,
    auction: { status: auction.status, endsAt: auction.endsAt, extended: false },
  };
}

/** Appends the next link of the hash chain. */
async function appendBid(
  tx: Repositories,
  auction: AuctionRow,
  registration: AuctionRegistrationRow,
  kind: BidKind,
  amountCents: bigint,
  serverTime: Date,
  idempotencyKey: string,
) {
  const last = await tx.bids.findLast(auction.id);
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? genesisHash(auction.id);
  const hash = bidHash({
    prevHash,
    auctionId: auction.id,
    pseudonym: registration.pseudonym,
    amountCents,
    serverTime,
    seq,
  });
  const bid = await tx.bids.append({
    auctionId: auction.id,
    registrationId: registration.id,
    seq,
    amountCents,
    kind,
    serverTime,
    prevHash,
    hash,
    idempotencyKey,
  });
  return { ...bid, pseudonym: registration.pseudonym };
}

async function recordBid(
  tx: Repositories,
  actor: Actor,
  bid: Awaited<ReturnType<typeof appendBid>>,
  before: AuctionRow,
  after: AuctionRow,
  now: Date,
) {
  await tx.auditLog.append({
    actorId: actor.userId,
    entity: 'auction',
    entityId: before.id,
    action: `bid.${bid.kind.toLowerCase()}`,
    before: {
      status: before.status,
      currentPriceCents: before.currentPriceCents?.toString() ?? null,
      endsAt: before.endsAt?.toISOString() ?? null,
    },
    after: {
      status: after.status,
      seq: bid.seq,
      pseudonym: bid.pseudonym,
      amountCents: bid.amountCents.toString(),
      hash: bid.hash,
      currentPriceCents: after.currentPriceCents?.toString() ?? null,
      endsAt: after.endsAt?.toISOString() ?? null,
    },
    at: now,
  });
  await tx.auctionEvents.publish({ auctionId: before.id, type: 'bid' });
}

/** ASCENDING (or descending continued as ascending): a binding, irrevocable bid. */
export function placeBid(
  ctx: BiddingContext,
  actor: Actor,
  auctionId: string,
  cmd: BidCommand,
): Promise<BidResult> {
  return ctx.uow.transaction(async (tx) => {
    const { auction, registration } = await lockForBid(tx, actor, auctionId);
    const existing = await tx.bids.findByIdempotencyKey(registration.id, cmd.idempotencyKey);
    if (existing) return replay(existing, registration, auction, 'BID', cmd.amountCents);

    const now = ctx.clock.now();
    if (auction.status !== 'LIVE') {
      throw new DomainError('CONFLICT', 'Dražba trenutno ne poteka, ponudbe ni mogoče oddati.');
    }
    if (!isAscendingMode(auction)) {
      throw new DomainError(
        'CONFLICT',
        'Na dražbi z zniževanjem cene lahko le sprejmete trenutno ceno.',
      );
    }
    if (auction.endsAt === null || now.getTime() >= auction.endsAt.getTime()) {
      throw new DomainError('CONFLICT', 'Dražba se je že končala, ponudba ni bila sprejeta.');
    }
    // LEGAL-REVIEW: may the leader raise their own bid? — see docs/legal-review.md
    if (auction.leadingRegistrationId === registration.id) {
      throw new DomainError('CONFLICT', 'Vaša ponudba je že najvišja.');
    }
    const amountError = bidAmountError(auction, cmd.amountCents);
    if (amountError) {
      throw new DomainError('VALIDATION', amountError, { amountCents: amountError });
    }

    const bid = await appendBid(
      tx,
      auction,
      registration,
      'BID',
      cmd.amountCents,
      now,
      cmd.idempotencyKey,
    );
    const endsAt = extendedEndsAt(
      auction.endsAt,
      now,
      auction.extensionWindowSec,
      auction.extensionSec,
    );
    const after = await tx.auctions.update(auction.id, {
      currentPriceCents: cmd.amountCents,
      leadingRegistrationId: registration.id,
      endsAt,
    });
    if (!after) throw notFound('Dražba');
    await recordBid(tx, actor, bid, auction, after, now);
    return {
      bid,
      duplicate: false,
      auction: {
        status: after.status,
        endsAt: after.endsAt,
        extended: endsAt.getTime() !== auction.endsAt.getTime(),
      },
    };
  });
}

/** DESCENDING: the first bidder to accept the current price level wins it. */
export function acceptCurrentPrice(
  ctx: BiddingContext,
  actor: Actor,
  auctionId: string,
  cmd: PriceCommand,
): Promise<BidResult> {
  return ctx.uow.transaction(async (tx) => {
    const locked = await lockForBid(tx, actor, auctionId);
    let auction = locked.auction;
    const { registration } = locked;
    const existing = await tx.bids.findByIdempotencyKey(registration.id, cmd.idempotencyKey);
    if (existing) return replay(existing, registration, auction, 'ACCEPT', null);

    const now = ctx.clock.now();
    if (auction.type === 'DESCENDING' && auction.acceptedAt !== null) {
      throw new DomainError(
        'CONFLICT',
        auction.switchToAscendingOnAccept
          ? 'Ceno je že sprejel drug dražitelj. Dražba se nadaljuje z zviševanjem – oddajte višjo ponudbo.'
          : 'Ceno je že sprejel drug dražitelj.',
      );
    }
    if (auction.type !== 'DESCENDING' || auction.status !== 'LIVE') {
      throw new DomainError('CONFLICT', 'Dražba trenutno ne poteka, cene ni mogoče sprejeti.');
    }

    // The worker executes price drops; if one is due but not executed yet, do it here first
    // so the price always follows server time.
    const step = descendingStepAt(auction, now);
    if (step.expired) {
      throw new DomainError('CONFLICT', 'Dražba se je končala, cene ni več mogoče sprejeti.');
    }
    if (step.step !== auction.currentStep || auction.currentPriceCents !== step.priceCents) {
      auction = await applyDescendingStep(tx, auction, step, now);
    }
    if (cmd.expectedPriceCents !== step.priceCents) {
      throw new DomainError(
        'CONFLICT',
        `Cena se je medtem spremenila na ${formatCents(step.priceCents)}. Preverite in potrdite znova.`,
      );
    }

    const bid = await appendBid(
      tx,
      auction,
      registration,
      'ACCEPT',
      step.priceCents,
      now,
      cmd.idempotencyKey,
    );
    let after = await tx.auctions.update(auction.id, {
      currentPriceCents: step.priceCents,
      leadingRegistrationId: registration.id,
      acceptedAt: now,
      ...(auction.switchToAscendingOnAccept ? { endsAt: continuationEndsAt(auction, now) } : {}),
    });
    if (!after) throw notFound('Dražba');
    await recordBid(tx, actor, bid, auction, after, now);
    // Without the switch, the first acceptance ends the main phase.
    if (!after.switchToAscendingOnAccept) {
      after = await closeMainPhase(tx, after, now, ctx.appUrl, null);
    }
    return {
      bid,
      duplicate: false,
      auction: { status: after.status, endsAt: after.endsAt, extended: false },
    };
  });
}

/** PREEMPTION: a registered pre-emption holder matches (never exceeds) the highest bid. */
export function matchAsPreemptionHolder(
  ctx: BiddingContext,
  actor: Actor,
  auctionId: string,
  cmd: PriceCommand,
): Promise<BidResult> {
  return ctx.uow.transaction(async (tx) => {
    const { auction, registration } = await lockForBid(tx, actor, auctionId);
    const existing = await tx.bids.findByIdempotencyKey(registration.id, cmd.idempotencyKey);
    if (existing) return replay(existing, registration, auction, 'PREEMPTION_MATCH', null);

    const now = ctx.clock.now();
    if (
      auction.status !== 'PREEMPTION' ||
      auction.preemptionEndsAt === null ||
      now.getTime() >= auction.preemptionEndsAt.getTime()
    ) {
      throw new DomainError('CONFLICT', 'Faza uveljavljanja predkupne pravice ne poteka.');
    }
    if (!registration.isPreemptionHolder) {
      throw new DomainError('FORBIDDEN', 'Niste predkupni upravičenec na tej dražbi.');
    }
    const regs = await tx.auctionRegistrations.listByAuction(auction.id);
    const eligible = eligiblePreemptionHolders(regs, auction.leadingRegistrationId);
    if (!eligible.some((r) => r.id === registration.id)) {
      throw new DomainError(
        'CONFLICT',
        auction.leadingRegistrationId === registration.id
          ? 'Predkupno pravico ste že uveljavili.'
          : 'Predkupno pravico je že uveljavil upravičenec z boljšim vrstnim redom.',
      );
    }
    const price = auction.currentPriceCents;
    if (price === null) throw new Error('preemption phase without a price');
    if (cmd.expectedPriceCents !== price) {
      throw new DomainError(
        'CONFLICT',
        `Najvišja ponudba je ${formatCents(price)}. Izenačite lahko le to ceno.`,
      );
    }

    const bid = await appendBid(
      tx,
      auction,
      registration,
      'PREEMPTION_MATCH',
      price,
      now,
      cmd.idempotencyKey,
    );
    let after = await tx.auctions.update(auction.id, { leadingRegistrationId: registration.id });
    if (!after) throw notFound('Dražba');
    await recordBid(tx, actor, bid, auction, after, now);
    // LEGAL-REVIEW: pre-emption phase mechanics — see docs/legal-review.md
    // Nobody ranked better can still match: the phase is decided.
    if (eligiblePreemptionHolders(regs, registration.id).length === 0) {
      after = await closePreemption(tx, after, now, ctx.appUrl, null);
    }
    return {
      bid,
      duplicate: false,
      auction: { status: after.status, endsAt: after.endsAt, extended: false },
    };
  });
}
