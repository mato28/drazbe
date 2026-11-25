import type { AuctionPatch, AuctionRow, Repositories } from '@domik/db';
import { DomainError } from '../errors';
import { settleAuction } from '../post-auction/settlement';
import { descendingStepAt, eligiblePreemptionHolders, type DescendingStep } from './rules';

/**
 * State transitions shared by the bid transaction and the worker clock. Every function here
 * must be called inside a transaction holding `SELECT ... FOR UPDATE` on the auction row.
 * actorId null = system (worker clock). `appUrl` is used for links in the emails sent when the
 * auction closes (see settleAuction).
 */

async function update(
  tx: Repositories,
  a: AuctionRow,
  patch: AuctionPatch,
  action: string,
  actorId: string | null,
  now: Date,
  details: Record<string, unknown> = {},
): Promise<AuctionRow> {
  const row = await tx.auctions.update(a.id, patch);
  if (!row) throw new DomainError('NOT_FOUND', 'Dražba ne obstaja.');
  await tx.auditLog.append({
    actorId,
    entity: 'auction',
    entityId: a.id,
    action,
    before: { status: a.status },
    after: { status: row.status, ...details },
    at: now,
  });
  return row;
}

export function closeRegistration(tx: Repositories, a: AuctionRow, now: Date) {
  return update(tx, a, { status: 'REGISTRATION_CLOSED' }, 'auction.registration_closed', null, now);
}

/** Goes LIVE. DESCENDING starts at the price level due at `now` (normally the starting price). */
export function startAuction(tx: Repositories, a: AuctionRow, now: Date) {
  if (a.type === 'DESCENDING') {
    const s = descendingStepAt(a, now);
    return update(
      tx,
      a,
      { status: 'LIVE', currentPriceCents: s.priceCents, currentStep: s.step },
      'auction.started',
      null,
      now,
      { currentPriceCents: s.priceCents.toString(), currentStep: s.step },
    );
  }
  return update(tx, a, { status: 'LIVE', currentPriceCents: null }, 'auction.started', null, now);
}

/** Moves a DESCENDING auction to the price level `s` (executed on server time). */
export function applyDescendingStep(
  tx: Repositories,
  a: AuctionRow,
  s: DescendingStep,
  now: Date,
  actorId: string | null = null,
) {
  return update(
    tx,
    a,
    { currentPriceCents: s.priceCents, currentStep: s.step },
    'auction.price_step',
    actorId,
    now,
    { currentPriceCents: s.priceCents.toString(), currentStep: s.step },
  );
}

/** Nobody bid (ascending) or nobody accepted down to the floor (descending). */
export async function markUnsuccessful(
  tx: Repositories,
  a: AuctionRow,
  now: Date,
  reason: string,
  appUrl: string,
) {
  const row = await update(
    tx,
    a,
    { status: 'UNSUCCESSFUL', closedAt: now, closedReason: reason },
    'auction.unsuccessful',
    null,
    now,
    { reason },
  );
  return settleAuction(tx, row, now, appUrl);
}

async function award(
  tx: Repositories,
  a: AuctionRow,
  now: Date,
  appUrl: string,
  actorId: string | null,
): Promise<AuctionRow> {
  const leader = a.leadingRegistrationId
    ? await tx.auctionRegistrations.findById(a.leadingRegistrationId)
    : undefined;
  if (!leader) throw new Error(`auction ${a.id} has no leading registration to award`);
  const row = await update(
    tx,
    a,
    { status: 'ENDED', winnerBidderId: leader.bidderId, closedAt: now },
    'auction.awarded',
    actorId,
    now,
    {
      winnerPseudonym: leader.pseudonym,
      priceCents: a.currentPriceCents?.toString() ?? null,
    },
  );
  return settleAuction(tx, row, now, appUrl);
}

/**
 * The main phase is over. No leader -> UNSUCCESSFUL. A leader and pre-emption holders who can
 * still match -> PREEMPTION. Otherwise the leader wins (ENDED).
 */
export async function closeMainPhase(
  tx: Repositories,
  a: AuctionRow,
  now: Date,
  appUrl: string,
  actorId: string | null = null,
): Promise<AuctionRow> {
  if (!a.leadingRegistrationId) {
    return markUnsuccessful(
      tx,
      a,
      now,
      'Na dražbi ni bila oddana nobena veljavna ponudba.',
      appUrl,
    );
  }
  if (a.preemptionEnabled) {
    const regs = await tx.auctionRegistrations.listByAuction(a.id);
    if (eligiblePreemptionHolders(regs, a.leadingRegistrationId).length > 0) {
      const preemptionEndsAt = new Date(now.getTime() + a.preemptionWindowSec * 1000);
      return update(
        tx,
        a,
        { status: 'PREEMPTION', preemptionEndsAt },
        'auction.preemption_opened',
        actorId,
        now,
        { preemptionEndsAt: preemptionEndsAt.toISOString() },
      );
    }
  }
  return award(tx, a, now, appUrl, actorId);
}

/** End of the PREEMPTION phase: the (possibly replaced) leader wins. */
export function closePreemption(
  tx: Repositories,
  a: AuctionRow,
  now: Date,
  appUrl: string,
  actorId: string | null = null,
) {
  return award(tx, a, now, appUrl, actorId);
}
