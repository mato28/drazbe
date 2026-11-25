import { and, asc, desc, eq, getTableColumns, isNull } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { auctionRegistrations, bids } from '../schema';

export type BidRow = typeof bids.$inferSelect;
export type NewBid = Omit<typeof bids.$inferInsert, 'id' | 'tsaToken'>;
/** A bid with the pseudonym it was placed under (part of the hash input). */
export type BidWithPseudonym = BidRow & { pseudonym: string };

/** Append-only: there is intentionally no update/delete here (the DB enforces it too). */
export function bidsRepository(db: Executor) {
  return {
    async append(data: NewBid): Promise<BidRow> {
      return one(await db.insert(bids).values(data).returning());
    },
    async findLast(auctionId: string): Promise<BidRow | undefined> {
      return db.query.bids.findFirst({
        where: eq(bids.auctionId, auctionId),
        orderBy: desc(bids.seq),
      });
    },
    async listByAuction(auctionId: string): Promise<BidRow[]> {
      return db.query.bids.findMany({
        where: eq(bids.auctionId, auctionId),
        orderBy: asc(bids.seq),
      });
    },
    async findByIdempotencyKey(
      registrationId: string,
      idempotencyKey: string,
    ): Promise<BidRow | undefined> {
      return db.query.bids.findFirst({
        where: and(
          eq(bids.registrationId, registrationId),
          eq(bids.idempotencyKey, idempotencyKey),
        ),
      });
    },
    /** The full bid log of an auction in chain order, with pseudonyms. */
    async listByAuctionWithPseudonym(auctionId: string): Promise<BidWithPseudonym[]> {
      return db
        .select({ ...getTableColumns(bids), pseudonym: auctionRegistrations.pseudonym })
        .from(bids)
        .innerJoin(auctionRegistrations, eq(bids.registrationId, auctionRegistrations.id))
        .where(eq(bids.auctionId, auctionId))
        .orderBy(asc(bids.seq));
    },
    async listMissingTimestamp(limit: number): Promise<BidRow[]> {
      return db.query.bids.findMany({
        where: isNull(bids.tsaToken),
        orderBy: asc(bids.serverTime),
        limit,
      });
    },
    /** The only permitted mutation: attach the TSA token once. Returns false if already set. */
    async attachTsaToken(id: string, token: string): Promise<boolean> {
      const rows = await db
        .update(bids)
        .set({ tsaToken: token })
        .where(and(eq(bids.id, id), isNull(bids.tsaToken)))
        .returning({ id: bids.id });
      return rows.length === 1;
    },
  };
}
