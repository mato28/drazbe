import { type AuctionStatus } from '@domik/shared';

/** Trustee-initiated lifecycle actions. (LIVE/ENDED/... transitions belong to the worker clock.) */
export const AUCTION_ACTIONS = ['publish', 'cancel', 'stop'] as const;
export type AuctionAction = (typeof AUCTION_ACTIONS)[number];

const ALLOWED_FROM: Record<AuctionAction, readonly AuctionStatus[]> = {
  publish: ['DRAFT'],
  // Before the auction is live it can be called off.
  cancel: ['DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED'],
  // While it is running it can only be stopped.
  stop: ['LIVE', 'PREEMPTION'],
};

const RESULT: Record<AuctionAction, AuctionStatus> = {
  publish: 'PUBLISHED',
  cancel: 'CANCELLED',
  // LEGAL-REVIEW: outcome of an auction stopped mid-way — see docs/legal-review.md
  stop: 'CANCELLED',
};

export function canPerform(action: AuctionAction, status: AuctionStatus): boolean {
  return ALLOWED_FROM[action].includes(status);
}

export function statusAfter(action: AuctionAction): AuctionStatus {
  return RESULT[action];
}

/** Statuses in which the lot (and its case) must no longer be edited. */
export const LOCKING_STATUSES: readonly AuctionStatus[] = [
  'PUBLISHED',
  'REGISTRATION_CLOSED',
  'LIVE',
  'PREEMPTION',
  'ENDED',
];

/** Statuses of an auction that is still open (not finished one way or the other). */
export const OPEN_STATUSES: readonly AuctionStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_CLOSED',
  'LIVE',
  'PREEMPTION',
];
