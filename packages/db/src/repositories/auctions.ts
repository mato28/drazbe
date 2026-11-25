import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, lte, notExists, or, sql } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { auctions, documents, insolvencyCases, lots } from '../schema';

export type AuctionRow = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;
export type AuctionStatus = AuctionRow['status'];
export type AuctionPatch = Partial<Omit<NewAuction, 'id' | 'lotId' | 'createdAt' | 'updatedAt'>>;

export function auctionsRepository(db: Executor) {
  return {
    async create(data: NewAuction): Promise<AuctionRow> {
      return one(await db.insert(auctions).values(data).returning());
    },
    async findById(id: string): Promise<AuctionRow | undefined> {
      return db.query.auctions.findFirst({ where: eq(auctions.id, id) });
    },
    /**
     * `SELECT ... FOR UPDATE` on the auction row. Only meaningful when this repository is
     * bound to a transaction: every bid / state change for an auction is serialized through it.
     */
    async lockById(id: string): Promise<AuctionRow | undefined> {
      const [row] = await db.select().from(auctions).where(eq(auctions.id, id)).for('update');
      return row;
    },
    /** Auction with its lot and the lot's insolvency case (for ownership checks). */
    async findWithLotAndCase(id: string) {
      return db.query.auctions.findFirst({
        where: eq(auctions.id, id),
        with: { lot: { with: { case: true } } },
      });
    },
    async listByLot(lotId: string): Promise<AuctionRow[]> {
      return db.query.auctions.findMany({
        where: eq(auctions.lotId, lotId),
        orderBy: desc(auctions.createdAt),
      });
    },
    /** All auctions on lots in the trustee's cases, newest first. */
    async listByTrustee(trusteeId: string) {
      return db
        .select({
          ...getTableColumns(auctions),
          lotTitle: lots.title,
          caseId: insolvencyCases.id,
          caseNumber: insolvencyCases.caseNumber,
        })
        .from(auctions)
        .innerJoin(lots, eq(auctions.lotId, lots.id))
        .innerJoin(insolvencyCases, eq(lots.caseId, insolvencyCases.id))
        .where(eq(insolvencyCases.trusteeId, trusteeId))
        .orderBy(desc(auctions.createdAt));
    },
    async update(id: string, patch: AuctionPatch): Promise<AuctionRow | undefined> {
      const [row] = await db.update(auctions).set(patch).where(eq(auctions.id, id)).returning();
      return row;
    },
    async listByStatus(statuses: AuctionStatus[]): Promise<AuctionRow[]> {
      return db.query.auctions.findMany({
        where: inArray(auctions.status, statuses),
        orderBy: asc(auctions.startsAt),
      });
    },
    /**
     * Ids of auctions the worker clock may have to act on at `now`: published ones whose
     * registration deadline or start has passed, and everything that is running.
     */
    async listIdsForClock(now: Date): Promise<string[]> {
      const at = sql`${now.toISOString()}::timestamptz`;
      const rows = await db
        .select({ id: auctions.id })
        .from(auctions)
        .where(
          or(
            and(eq(auctions.status, 'PUBLISHED'), lte(auctions.registrationDeadline, at)),
            and(eq(auctions.status, 'REGISTRATION_CLOSED'), lte(auctions.startsAt, at)),
            inArray(auctions.status, ['LIVE', 'PREEMPTION']),
          ),
        )
        .orderBy(asc(auctions.startsAt));
      return rows.map((r) => r.id);
    },
    /** Closed and settled auctions whose report (zapisnik) has not been generated yet. */
    async listIdsNeedingReport(): Promise<string[]> {
      const rows = await db
        .select({ id: auctions.id })
        .from(auctions)
        .where(
          and(
            isNotNull(auctions.settledAt),
            inArray(auctions.status, ['ENDED', 'UNSUCCESSFUL', 'CANCELLED']),
            notExists(
              db
                .select({ one: sql`1` })
                .from(documents)
                .where(
                  and(
                    eq(documents.ownerType, 'AUCTION'),
                    eq(documents.ownerId, auctions.id),
                    eq(documents.kind, 'AUCTION_REPORT'),
                  ),
                ),
            ),
          ),
        )
        .orderBy(asc(auctions.closedAt));
      return rows.map((r) => r.id);
    },
    /** Auctions in `status` whose start time has passed (for the worker clock). */
    async listDueToStart(status: AuctionStatus, now: Date): Promise<AuctionRow[]> {
      return db.query.auctions.findMany({
        where: and(eq(auctions.status, status), lte(auctions.startsAt, now)),
        orderBy: asc(auctions.startsAt),
      });
    },
  };
}
