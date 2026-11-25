import { type ClockOutcome } from '@domik/core';
import { type Logger } from './logger';

export interface AuctionClockLoopOptions {
  /** One clock tick (core `auctionClock.runClockTick`). */
  tick: () => Promise<ClockOutcome[]>;
  intervalMs: number;
  logger: Logger;
}

/**
 * Drives auctions on server time: every `intervalMs` it applies whatever is due (start, price
 * steps, end of the main phase, pre-emption, outcome). Ticks never overlap; a slow tick simply
 * delays the next one. Running several worker instances is safe (advisory locks in core).
 */
export function startAuctionClockLoop(opts: AuctionClockLoopOptions): () => Promise<void> {
  const state = { stopped: false, current: Promise.resolve() };
  let timer: NodeJS.Timeout | undefined;

  const run = async (): Promise<void> => {
    try {
      const outcomes = await opts.tick();
      for (const o of outcomes) {
        if (o.actions.length > 0) {
          opts.logger.info(`auction ${o.auctionId}: ${o.actions.join(', ')} -> ${o.status ?? '?'}`);
        }
      }
    } catch (e) {
      opts.logger.error(`auction clock: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const schedule = (): void => {
    if (state.stopped) return;
    timer = setTimeout(() => {
      state.current = run().finally(schedule);
    }, opts.intervalMs);
  };
  state.current = run().finally(schedule);

  return async () => {
    state.stopped = true;
    clearTimeout(timer);
    await state.current;
  };
}
