import { type Clock, type Mailer, type OutboxPort, processOutboxBatch } from '@domik/core';
import { type Logger } from './logger';

export interface OutboxLoopOptions {
  outbox: OutboxPort;
  mailer: Mailer;
  clock: Clock;
  logger: Logger;
  /** Subscribe to wake-up signals (Postgres NOTIFY). Returns an unsubscribe function. */
  subscribe: (onWake: () => void) => Promise<() => Promise<void>>;
  pollIntervalMs: number;
  batchSize?: number;
}

/**
 * Delivers notifications: runs on every NOTIFY and on a fallback poll interval.
 * Never runs two batches concurrently; a wake-up during a run triggers one more run.
 */
export async function startOutboxLoop(opts: OutboxLoopOptions): Promise<() => Promise<void>> {
  const batchSize = opts.batchSize ?? 20;
  // Mutated from concurrent wake-ups; read through an object so TS doesn't over-narrow.
  const state = { running: false, again: false, stopped: false };
  const isStopped = (): boolean => state.stopped;

  const run = async (): Promise<void> => {
    if (isStopped()) return;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        const res = await processOutboxBatch({
          outbox: opts.outbox,
          mailer: opts.mailer,
          clock: opts.clock,
          batchSize,
        });
        if (res.sent + res.retried + res.failed > 0) {
          opts.logger.info(`outbox: sent=${res.sent} retried=${res.retried} failed=${res.failed}`);
        }
        // A full batch probably means more work is waiting.
        if (res.sent + res.retried + res.failed >= batchSize) state.again = true;
      } while (state.again && !isStopped());
    } catch (e) {
      opts.logger.error(`outbox: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      state.running = false;
    }
  };

  const trigger = () => {
    void run();
  };
  const unsubscribe = await opts.subscribe(trigger);
  const timer = setInterval(trigger, opts.pollIntervalMs);
  trigger();

  return async () => {
    state.stopped = true;
    clearInterval(timer);
    await unsubscribe();
  };
}
