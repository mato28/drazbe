import { sql } from 'drizzle-orm';
import { type Executor } from '../client';

/** Advisory-lock namespace (first key) for the worker auction clock. */
const AUCTION_CLOCK_NAMESPACE = 0x0d0_c10c;

export function locksRepository(db: Executor) {
  return {
    /**
     * Transaction-scoped advisory lock on one auction for the worker clock. Returns false if
     * another worker instance holds it (that instance is handling the auction right now).
     * Released automatically at COMMIT/ROLLBACK, so it must be called inside a transaction.
     */
    async tryAuctionClockLock(auctionId: string): Promise<boolean> {
      const rows = await db.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(${AUCTION_CLOCK_NAMESPACE}, hashtext(${auctionId})) AS locked`,
      );
      return rows[0]?.locked === true;
    },
  };
}
