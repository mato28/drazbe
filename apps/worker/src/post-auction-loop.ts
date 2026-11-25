import { type Logger } from './logger';

export interface PostAuctionJobs {
  /** Auctions whose report (zapisnik) is still missing. */
  listAuctionsNeedingReport: () => Promise<string[]>;
  generateReports: (auctionId: string) => Promise<unknown>;
  /** Deadline reminders; returns the number of emails queued. */
  sendReminders: () => Promise<number>;
}

export interface PostAuctionLoopOptions {
  jobs: PostAuctionJobs;
  intervalMs: number;
  logger: Logger;
  /** Wake early (e.g. on an auction status event) instead of waiting for the interval. */
  subscribe?: (onWake: () => void) => Promise<() => Promise<void>>;
}

/**
 * After auctions close: renders the auction reports (full + public) and sends sale deadline
 * reminders. One failing auction does not block the others; everything is idempotent, so a
 * crash or a second worker instance at worst repeats a no-op.
 */
export async function startPostAuctionLoop(
  opts: PostAuctionLoopOptions,
): Promise<() => Promise<void>> {
  const state = { stopped: false, again: false, running: false, current: Promise.resolve() };
  let timer: NodeJS.Timeout | undefined;

  const pass = async (): Promise<void> => {
    try {
      for (const id of await opts.jobs.listAuctionsNeedingReport()) {
        try {
          if (await opts.jobs.generateReports(id))
            opts.logger.info(`auction ${id}: report generated`);
        } catch (e) {
          opts.logger.error(
            `auction ${id}: report failed: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      const queued = await opts.jobs.sendReminders();
      if (queued > 0) opts.logger.info(`sale reminders queued: ${String(queued)}`);
    } catch (e) {
      opts.logger.error(`post-auction jobs: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const run = (): void => {
    if (state.stopped) return;
    if (state.running) {
      state.again = true;
      return;
    }
    clearTimeout(timer);
    state.running = true;
    state.current = pass().finally(() => {
      state.running = false;
      if (state.again) {
        state.again = false;
        run();
      } else if (!state.stopped) {
        timer = setTimeout(run, opts.intervalMs);
      }
    });
  };

  const unsubscribe = opts.subscribe ? await opts.subscribe(run) : undefined;
  run();

  return async () => {
    state.stopped = true;
    clearTimeout(timer);
    await unsubscribe?.();
    await state.current;
  };
}
