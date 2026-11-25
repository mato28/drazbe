import { sql } from 'drizzle-orm';
import { type Executor } from '../client';

/** Postgres NOTIFY channel for live auction changes (bids, price steps, phase changes). */
export const AUCTION_EVENTS_CHANNEL = 'auction_events';

export interface AuctionEvent {
  auctionId: string;
  /** e.g. "bid", "price_drop", "status" — informational; listeners reload the state. */
  type: string;
}

export function auctionEventsRepository(db: Executor) {
  return {
    /**
     * Queues a NOTIFY. Inside a transaction Postgres delivers it only on COMMIT (and drops it
     * on ROLLBACK), so listeners never see a change that did not happen.
     */
    async publish(event: AuctionEvent): Promise<void> {
      await db.execute(sql`SELECT pg_notify(${AUCTION_EVENTS_CHANNEL}, ${JSON.stringify(event)})`);
    },
  };
}

/** Parses a NOTIFY payload; null if it is not an auction event. */
export function parseAuctionEvent(payload: string): AuctionEvent | null {
  try {
    const v = JSON.parse(payload) as Partial<AuctionEvent>;
    return typeof v.auctionId === 'string' && typeof v.type === 'string'
      ? { auctionId: v.auctionId, type: v.type }
      : null;
  } catch {
    return null;
  }
}
