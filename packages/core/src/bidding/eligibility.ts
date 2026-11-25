import type { AuctionRegistrationRow, BidderProfileRow } from '@domik/db';
import { type BiddingAccess } from '@domik/shared';
import { type Actor, type ServiceContext } from '../context';
import { DomainError, notFound } from '../errors';

/**
 * The gate in front of every bidding endpoint: only a bidder whose registration for THIS
 * auction is APPROVED (identity verified + deposit paid, approved by the trustee) gets in.
 * Returns the pseudonym the bidder acts under.
 */
export async function requireBiddingAccess(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<BiddingAccess> {
  const { repos } = ctx.uow;
  if (actor.role !== 'BIDDER') {
    throw new DomainError('FORBIDDEN', 'Na dražbi lahko sodelujejo samo dražitelji.');
  }
  const auction = await repos.auctions.findById(auctionId);
  if (!auction || auction.status === 'DRAFT' || auction.publishedAt === null)
    throw notFound('Dražba');

  const profile = await repos.bidderProfiles.findByUserId(actor.userId);
  const registration = profile
    ? await repos.auctionRegistrations.findByAuctionAndBidder(auctionId, profile.id)
    : undefined;
  assertEligible(profile, registration);
  return {
    auctionId,
    pseudonym: registration.pseudonym,
    isPreemptionHolder: registration.isPreemptionHolder,
  };
}

/**
 * Deposit states that mean "was paid". Besides PAID, the others are set only when the auction
 * closes (settlement), so a late request still reaches the "auction closed" check (409) and an
 * idempotent retry still finds its bid.
 */
const PAID_DEPOSIT = new Set<AuctionRegistrationRow['depositStatus']>([
  'PAID',
  'APPLIED',
  'REFUND_PENDING',
  'REFUNDED',
  'FORFEITED',
]);

/** Throws 403 unless the registration allows bidding (APPROVED + deposit PAID + identity VERIFIED). */
export function assertEligible(
  profile: Pick<BidderProfileRow, 'status'> | undefined,
  registration: Pick<AuctionRegistrationRow, 'status' | 'depositStatus'> | undefined,
): asserts registration is AuctionRegistrationRow {
  if (!profile || !registration) {
    throw new DomainError('FORBIDDEN', 'Na to dražbo niste prijavljeni.');
  }
  if (registration.status === 'REJECTED') {
    throw new DomainError('FORBIDDEN', 'Vaša prijava na to dražbo je bila zavrnjena.');
  }
  // Defence in depth: APPROVED already implies these, but bidding must never rely on one flag.
  if (
    registration.status !== 'APPROVED' ||
    !PAID_DEPOSIT.has(registration.depositStatus) ||
    profile.status !== 'VERIFIED'
  ) {
    throw new DomainError('FORBIDDEN', 'Vaša prijava na to dražbo še ni potrjena.');
  }
}
