import type { AuctionRow } from '@domik/db';
import { formatCents } from '@domik/shared';
import { descendingSchedule } from '../auctions/config';
import { configOf } from '../auctions/service';

/**
 * Pure auction rules (CLAUDE.md "Auction rules"). Everything here is a function of the auction
 * row and the SERVER time passed in — never the client's clock.
 */

/** True while bidders compete with ever higher bids: ASCENDING, or DESCENDING after an accept with switch. */
export function isAscendingMode(a: Pick<AuctionRow, 'type' | 'acceptedAt'>): boolean {
  return a.type === 'ASCENDING' || a.acceptedAt !== null;
}

/** The lowest bid accepted right now (first bid: the starting price; then current + increment). */
export function minimumBid(
  a: Pick<AuctionRow, 'startingPriceCents' | 'currentPriceCents' | 'bidIncrementCents'>,
): bigint {
  if (a.currentPriceCents === null) return a.startingPriceCents;
  if (a.bidIncrementCents === null) throw new Error('ascending auction without bid increment');
  return a.currentPriceCents + a.bidIncrementCents;
}

/** Slovenian error for a too-low bid, or null if `amount` is acceptable. */
export function bidAmountError(
  a: Pick<AuctionRow, 'startingPriceCents' | 'currentPriceCents' | 'bidIncrementCents'>,
  amountCents: bigint,
): string | null {
  const min = minimumBid(a);
  if (amountCents >= min) return null;
  return a.currentPriceCents === null
    ? `Prva ponudba mora biti vsaj enaka izklicni ceni (${formatCents(min)}).`
    : `Ponudba mora biti vsaj ${formatCents(min)} (trenutna cena + korak draženja).`;
}

/**
 * Anti-sniping: a valid bid arriving LESS than `windowSec` before `endsAt` moves the end to
 * `now + extensionSec` (never earlier than it already was). Repeats without limit.
 * Exactly `windowSec` before the end does not extend.
 */
export function extendedEndsAt(
  endsAt: Date,
  now: Date,
  windowSec: number,
  extensionSec: number,
): Date {
  const remainingMs = endsAt.getTime() - now.getTime();
  if (remainingMs >= windowSec * 1000) return endsAt;
  return new Date(Math.max(endsAt.getTime(), now.getTime() + extensionSec * 1000));
}

// LEGAL-REVIEW: how long the ascending continuation after a descending accept runs — see docs/legal-review.md
/** Minimum length of the ascending continuation after a descending accept (with switch). */
export const MIN_CONTINUATION_SEC = 60;

/** End of the ascending continuation that starts with an accept at `now`. */
export function continuationEndsAt(a: Pick<AuctionRow, 'extensionSec'>, now: Date): Date {
  return new Date(now.getTime() + Math.max(a.extensionSec, MIN_CONTINUATION_SEC) * 1000);
}

export interface DescendingStep {
  /** 0-based price level (0 = starting price). */
  step: number;
  priceCents: bigint;
  /** When this level expires (the next drop, or the end if this is the floor level). */
  stepEndsAt: Date;
  /** This is the floor (last) level. */
  isLast: boolean;
  /** The floor level has expired: nobody accepted. */
  expired: boolean;
  /** Price of the next level, null at the floor. */
  nextPriceCents: bigint | null;
}

function descendingParams(a: AuctionRow) {
  const schedule = descendingSchedule(configOf(a));
  const { priceDecrementCents: dec, floorPriceCents: floor, stepDurationSec: stepSec } = a;
  if (!schedule || dec === null || floor === null || stepSec === null) {
    throw new Error('not a valid descending auction');
  }
  return { dec, floor, stepMs: stepSec * 1000, lastStep: schedule.steps - 1 };
}

/** Price level `step` (0 = starting price) of a DESCENDING auction; clamped to the floor level. */
export function descendingLevel(a: AuctionRow, step: number): Omit<DescendingStep, 'expired'> {
  const { dec, floor, stepMs, lastStep } = descendingParams(a);
  const s = Math.min(Math.max(0, step), lastStep);
  const priceAt = (n: number): bigint => {
    const p = a.startingPriceCents - BigInt(n) * dec;
    return p < floor ? floor : p;
  };
  return {
    step: s,
    priceCents: priceAt(s),
    stepEndsAt: new Date(a.startsAt.getTime() + (s + 1) * stepMs),
    isLast: s === lastStep,
    nextPriceCents: s < lastStep ? priceAt(s + 1) : null,
  };
}

/**
 * Price level of a DESCENDING auction at server time `now`: the price drops by
 * `priceDecrement` every `stepDurationSec` from `startsAt`, never below `floorPrice`.
 */
export function descendingStepAt(a: AuctionRow, now: Date): DescendingStep {
  const { stepMs, lastStep } = descendingParams(a);
  const raw = Math.floor(Math.max(0, now.getTime() - a.startsAt.getTime()) / stepMs);
  return { ...descendingLevel(a, raw), expired: raw > lastStep };
}

/** Registrations that may still use their pre-emption right against the current leader. */
export function eligiblePreemptionHolders<
  R extends {
    id: string;
    isPreemptionHolder: boolean;
    preemptionRank: number | null;
    status: string;
    depositStatus: string;
  },
>(registrations: readonly R[], leadingRegistrationId: string | null): R[] {
  const leader = registrations.find((r) => r.id === leadingRegistrationId);
  // LEGAL-REVIEW: ordering of multiple pre-emption holders — see docs/legal-review.md
  // A holder ranked better (lower number) than a leading holder still takes precedence.
  const leaderRank = leader?.isPreemptionHolder ? (leader.preemptionRank ?? Infinity) : Infinity;
  return registrations
    .filter(
      (r) =>
        r.isPreemptionHolder &&
        r.status === 'APPROVED' &&
        r.depositStatus === 'PAID' &&
        r.id !== leadingRegistrationId &&
        (r.preemptionRank ?? Infinity) < leaderRank,
    )
    .sort((x, y) => (x.preemptionRank ?? 0) - (y.preemptionRank ?? 0));
}
