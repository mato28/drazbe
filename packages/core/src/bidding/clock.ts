import type { AuctionRow, Repositories } from '@domik/db';
import { type BiddingContext } from './engine';
import { descendingStepAt, isAscendingMode } from './rules';
import {
  applyDescendingStep,
  closeMainPhase,
  closePreemption,
  closeRegistration,
  markUnsuccessful,
  startAuction,
} from './transitions';

export interface ClockOutcome {
  auctionId: string;
  /** Another worker instance is handling this auction right now. */
  skipped: boolean;
  /** Audit actions applied in this run, in order (empty = nothing was due). */
  actions: string[];
  status: AuctionRow['status'] | null;
}

/** One transition due at `now`, or null when the auction is up to date. */
async function nextTransition(
  tx: Repositories,
  a: AuctionRow,
  now: Date,
  appUrl: string,
): Promise<{ row: AuctionRow; action: string } | null> {
  const t = now.getTime();
  switch (a.status) {
    case 'PUBLISHED':
      if (a.startsAt.getTime() <= t || a.registrationDeadline.getTime() <= t) {
        return { row: await closeRegistration(tx, a, now), action: 'registration_closed' };
      }
      return null;
    case 'REGISTRATION_CLOSED':
      if (a.startsAt.getTime() <= t)
        return { row: await startAuction(tx, a, now), action: 'started' };
      return null;
    case 'LIVE': {
      if (isAscendingMode(a)) {
        if (a.endsAt !== null && a.endsAt.getTime() <= t) {
          return { row: await closeMainPhase(tx, a, now, appUrl), action: 'main_phase_closed' };
        }
        return null;
      }
      const step = descendingStepAt(a, now);
      if (step.expired) {
        const reason = 'Do izteka zadnjega koraka pri najnižji ceni nihče ni sprejel cene.';
        return { row: await markUnsuccessful(tx, a, now, reason, appUrl), action: 'unsuccessful' };
      }
      if (step.step !== a.currentStep) {
        return { row: await applyDescendingStep(tx, a, step, now), action: 'price_step' };
      }
      return null;
    }
    case 'PREEMPTION':
      if (a.preemptionEndsAt !== null && a.preemptionEndsAt.getTime() <= t) {
        return { row: await closePreemption(tx, a, now, appUrl), action: 'preemption_closed' };
      }
      return null;
    default:
      // DRAFT, ENDED, UNSUCCESSFUL, CANCELLED (incl. stopped by the trustee): nothing to do.
      return null;
  }
}

/**
 * Applies every transition of one auction that is due at server time (registration close,
 * start, descending price steps, end of the main phase, pre-emption phase, outcome).
 *
 * Safe with several worker instances: a transaction-scoped advisory lock lets only one of them
 * work on an auction at a time (others skip it), and the row lock (`FOR UPDATE`) serializes the
 * clock with bids. Re-running is harmless: transitions are derived from the stored state.
 */
export function advanceAuction(ctx: BiddingContext, auctionId: string): Promise<ClockOutcome> {
  return ctx.uow.transaction(async (tx) => {
    if (!(await tx.locks.tryAuctionClockLock(auctionId))) {
      return { auctionId, skipped: true, actions: [], status: null };
    }
    let a = await tx.auctions.lockById(auctionId);
    if (!a) return { auctionId, skipped: false, actions: [], status: null };

    const now = ctx.clock.now();
    const actions: string[] = [];
    // Bounded: at most registration close, start, one price step, phase close(s).
    for (let i = 0; i < 6; i++) {
      const next = await nextTransition(tx, a, now, ctx.appUrl);
      if (!next) break;
      a = next.row;
      actions.push(next.action);
    }
    if (actions.length > 0) {
      await tx.auctionEvents.publish({ auctionId, type: actions[actions.length - 1] ?? 'status' });
    }
    return { auctionId, skipped: false, actions, status: a.status };
  });
}

/** One clock tick: advances every auction that may have something due. */
export async function runClockTick(ctx: BiddingContext): Promise<ClockOutcome[]> {
  const ids = await ctx.uow.repos.auctions.listIdsForClock(ctx.clock.now());
  const outcomes: ClockOutcome[] = [];
  for (const id of ids) outcomes.push(await advanceAuction(ctx, id));
  return outcomes;
}
