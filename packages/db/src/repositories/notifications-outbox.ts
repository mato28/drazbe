import { asc, eq, sql } from 'drizzle-orm';
import { type Executor } from '../client';
import { notificationsOutbox } from '../schema';

export type OutboxRow = typeof notificationsOutbox.$inferSelect;
export interface EnqueueNotification {
  template: string;
  recipient: string;
  payload?: Record<string, unknown>;
  availableAt?: Date;
  dedupeKey?: string;
}

/** A SENDING row older than this is considered abandoned (worker crashed) and re-claimed. */
const STALE_SENDING_SECONDS = 300;

export function notificationsOutboxRepository(db: Executor) {
  return {
    /** Returns the row, or undefined if `dedupeKey` was already enqueued. */
    async enqueue(n: EnqueueNotification): Promise<OutboxRow | undefined> {
      const [row] = await db
        .insert(notificationsOutbox)
        .values({
          channel: 'EMAIL',
          template: n.template,
          recipient: n.recipient,
          payload: n.payload ?? {},
          ...(n.availableAt ? { availableAt: n.availableAt } : {}),
          ...(n.dedupeKey ? { dedupeKey: n.dedupeKey } : {}),
        })
        .onConflictDoNothing({ target: notificationsOutbox.dedupeKey })
        .returning();
      return row;
    },

    /** Atomically claim up to `limit` due rows (safe with concurrent workers). */
    async claimBatch(limit: number, now: Date): Promise<OutboxRow[]> {
      const t = notificationsOutbox;
      const nowIso = now.toISOString();
      const staleIso = new Date(now.getTime() - STALE_SENDING_SECONDS * 1000).toISOString();
      return db
        .update(t)
        .set({ status: 'SENDING', attempts: sql`${t.attempts} + 1`, updatedAt: now })
        .where(
          sql`${t.id} IN (
            SELECT id FROM ${t}
            WHERE (${t.status} = 'PENDING' AND ${t.availableAt} <= ${nowIso}::timestamptz)
               OR (${t.status} = 'SENDING' AND ${t.updatedAt} < ${staleIso}::timestamptz)
            ORDER BY ${t.availableAt}
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )`,
        )
        .returning();
    },

    async markSent(id: string, at: Date): Promise<void> {
      await db
        .update(notificationsOutbox)
        .set({ status: 'SENT', sentAt: at, lastError: null })
        .where(eq(notificationsOutbox.id, id));
    },

    /** `retryAt = null` marks the row permanently FAILED. */
    async markFailed(id: string, error: string, retryAt: Date | null): Promise<void> {
      await db
        .update(notificationsOutbox)
        .set(
          retryAt
            ? { status: 'PENDING', lastError: error, availableAt: retryAt }
            : { status: 'FAILED', lastError: error },
        )
        .where(eq(notificationsOutbox.id, id));
    },

    /** Notifications of one kind, oldest first (admin / diagnostics). */
    async listByTemplate(template: string): Promise<OutboxRow[]> {
      return db.query.notificationsOutbox.findMany({
        where: eq(notificationsOutbox.template, template),
        orderBy: asc(notificationsOutbox.createdAt),
      });
    },

    async findById(id: string): Promise<OutboxRow | undefined> {
      return db.query.notificationsOutbox.findFirst({ where: eq(notificationsOutbox.id, id) });
    },
  };
}
