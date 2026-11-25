import { type AuctionStatus, type AuctionType, type BidKind } from '@domik/shared';
import { type Actor } from '../context';
import { notFound } from '../errors';
import { type BiddingContext } from './engine';
import { descendingLevel, eligiblePreemptionHolders, isAscendingMode, minimumBid } from './rules';

/** Bids shown in the live view (the full log is in the auction report). */
export const LIVE_BID_LIMIT = 100;

export interface LiveBid {
  seq: number;
  pseudonym: string;
  amountCents: bigint;
  kind: BidKind;
  serverTime: Date;
}

export interface LiveViewer {
  pseudonym: string;
  /** May act in this auction (approved registration). */
  approved: boolean;
  isLeading: boolean;
  isPreemptionHolder: boolean;
  /** May match the highest bid right now. */
  canMatch: boolean;
}

/** Everything the live auction page shows. Only pseudonyms — never identities. */
export interface LiveAuctionState {
  auctionId: string;
  type: AuctionType;
  status: AuctionStatus;
  /** How bidding works right now. */
  mode: 'ASCENDING' | 'DESCENDING';
  serverTime: Date;
  startsAt: Date;
  endsAt: Date | null;
  startingPriceCents: bigint;
  currentPriceCents: bigint | null;
  /** ASCENDING mode: the lowest valid bid now. */
  minimumBidCents: bigint | null;
  bidIncrementCents: bigint | null;
  /** DESCENDING: the next drop (or, at the floor, when the auction ends without acceptance). */
  nextStepAt: Date | null;
  nextPriceCents: bigint | null;
  floorPriceCents: bigint | null;
  preemptionEndsAt: Date | null;
  leaderPseudonym: string | null;
  bidCount: number;
  bids: LiveBid[];
  closedReason: string | null;
  viewer: LiveViewer | null;
}

export async function getLiveState(
  ctx: BiddingContext,
  auctionId: string,
  actor: Actor | null,
): Promise<LiveAuctionState> {
  const { repos } = ctx.uow;
  const a = await repos.auctions.findById(auctionId);
  if (!a || a.status === 'DRAFT' || a.publishedAt === null) throw notFound('Dražba');

  const now = ctx.clock.now();
  const [allBids, regs] = await Promise.all([
    repos.bids.listByAuctionWithPseudonym(auctionId),
    repos.auctionRegistrations.listByAuction(auctionId),
  ]);
  const leader = regs.find((r) => r.id === a.leadingRegistrationId);
  const ascending = isAscendingMode(a);

  let nextStepAt: Date | null = null;
  let nextPriceCents: bigint | null = null;
  if (a.status === 'LIVE' && !ascending) {
    // From the stored step (what the worker executed), so all viewers agree.
    const s = descendingLevel(a, a.currentStep);
    nextStepAt = s.stepEndsAt;
    nextPriceCents = s.nextPriceCents;
  }

  let viewer: LiveViewer | null = null;
  if (actor?.role === 'BIDDER') {
    const profile = await repos.bidderProfiles.findByUserId(actor.userId);
    const reg = profile && regs.find((r) => r.bidderId === profile.id);
    if (reg) {
      const approved =
        reg.status === 'APPROVED' && reg.depositStatus === 'PAID' && profile.status === 'VERIFIED';
      viewer = {
        pseudonym: reg.pseudonym,
        approved,
        isLeading: a.leadingRegistrationId === reg.id,
        isPreemptionHolder: reg.isPreemptionHolder,
        canMatch:
          approved &&
          a.status === 'PREEMPTION' &&
          eligiblePreemptionHolders(regs, a.leadingRegistrationId).some((r) => r.id === reg.id),
      };
    }
  }

  return {
    auctionId: a.id,
    type: a.type,
    status: a.status,
    mode: ascending ? 'ASCENDING' : 'DESCENDING',
    serverTime: now,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    startingPriceCents: a.startingPriceCents,
    currentPriceCents: a.currentPriceCents,
    minimumBidCents: a.status === 'LIVE' && ascending ? minimumBid(a) : null,
    bidIncrementCents: a.bidIncrementCents,
    nextStepAt,
    nextPriceCents,
    floorPriceCents: a.floorPriceCents,
    preemptionEndsAt: a.preemptionEndsAt,
    leaderPseudonym: leader?.pseudonym ?? null,
    bidCount: allBids.length,
    bids: allBids
      .slice(-LIVE_BID_LIMIT)
      .reverse()
      .map((b) => ({
        seq: b.seq,
        pseudonym: b.pseudonym,
        amountCents: b.amountCents,
        kind: b.kind,
        serverTime: b.serverTime,
      })),
    closedReason: a.closedReason,
    viewer,
  };
}
