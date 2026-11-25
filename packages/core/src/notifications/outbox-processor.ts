import { type Clock } from '../clock';
import { renderEmail } from './templates';

export interface OutboxMessage {
  id: string;
  template: string;
  recipient: string;
  payload: Record<string, unknown>;
  /** Attempts including the current one. */
  attempts: number;
}

/** Storage port, implemented by @domik/db's notificationsOutbox repository. */
export interface OutboxPort {
  claimBatch(limit: number, now: Date): Promise<OutboxMessage[]>;
  markSent(id: string, at: Date): Promise<void>;
  markFailed(id: string, error: string, retryAt: Date | null): Promise<void>;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export interface ProcessOutboxOptions {
  outbox: OutboxPort;
  mailer: Mailer;
  clock: Clock;
  batchSize?: number;
  maxAttempts?: number;
}

export interface ProcessOutboxResult {
  sent: number;
  retried: number;
  failed: number;
}

/** Exponential backoff: 30s, 60s, 120s, ... capped at 1h. */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Claims one batch of due notifications and delivers them. */
export async function processOutboxBatch({
  outbox,
  mailer,
  clock,
  batchSize = 20,
  maxAttempts = 8,
}: ProcessOutboxOptions): Promise<ProcessOutboxResult> {
  const result: ProcessOutboxResult = { sent: 0, retried: 0, failed: 0 };
  const batch = await outbox.claimBatch(batchSize, clock.now());

  for (const msg of batch) {
    let rendered;
    try {
      rendered = renderEmail(msg.template, msg.payload);
    } catch (e) {
      // A bad template/payload will never succeed: fail permanently.
      await outbox.markFailed(msg.id, `render: ${errorMessage(e)}`, null);
      result.failed += 1;
      continue;
    }

    try {
      await mailer.send({ to: msg.recipient, ...rendered });
      await outbox.markSent(msg.id, clock.now());
      result.sent += 1;
    } catch (e) {
      if (msg.attempts >= maxAttempts) {
        await outbox.markFailed(msg.id, errorMessage(e), null);
        result.failed += 1;
      } else {
        const retryAt = new Date(clock.now().getTime() + retryDelayMs(msg.attempts));
        await outbox.markFailed(msg.id, errorMessage(e), retryAt);
        result.retried += 1;
      }
    }
  }
  return result;
}
