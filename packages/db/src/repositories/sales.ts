import { and, eq, inArray } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import {
  auctionRegistrations,
  auctions,
  bidderProfiles,
  insolvencyCases,
  lots,
  sales,
  trustees,
  users,
} from '../schema';

export type SaleRow = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type SaleStatus = SaleRow['status'];
export type SalePatch = Partial<Omit<NewSale, 'id' | 'auctionId' | 'createdAt' | 'updatedAt'>>;

export function salesRepository(db: Executor) {
  const detailed = () =>
    db
      .select({
        sale: sales,
        auction: auctions,
        lot: lots,
        case: insolvencyCases,
        trustee: trustees,
        trusteeUser: { id: users.id, email: users.email },
        registration: auctionRegistrations,
        buyer: bidderProfiles,
      })
      .from(sales)
      .innerJoin(auctions, eq(sales.auctionId, auctions.id))
      .innerJoin(lots, eq(auctions.lotId, lots.id))
      .innerJoin(insolvencyCases, eq(lots.caseId, insolvencyCases.id))
      .innerJoin(trustees, eq(insolvencyCases.trusteeId, trustees.id))
      .innerJoin(users, eq(trustees.userId, users.id))
      .innerJoin(auctionRegistrations, eq(sales.buyerRegistrationId, auctionRegistrations.id))
      .innerJoin(bidderProfiles, eq(auctionRegistrations.bidderId, bidderProfiles.id));

  return {
    async create(data: NewSale): Promise<SaleRow> {
      return one(await db.insert(sales).values(data).returning());
    },
    async findById(id: string): Promise<SaleRow | undefined> {
      return db.query.sales.findFirst({ where: eq(sales.id, id) });
    },
    async findByAuctionId(auctionId: string): Promise<SaleRow | undefined> {
      return db.query.sales.findFirst({ where: eq(sales.auctionId, auctionId) });
    },
    /** `SELECT ... FOR UPDATE` — serializes status changes of one sale. */
    async lockById(id: string): Promise<SaleRow | undefined> {
      const [row] = await db.select().from(sales).where(eq(sales.id, id)).for('update');
      return row;
    },
    async update(id: string, patch: SalePatch): Promise<SaleRow | undefined> {
      const [row] = await db.update(sales).set(patch).where(eq(sales.id, id)).returning();
      return row;
    },
    /** Sale with auction, lot, case, trustee and the buyer (for documents, emails, access checks). */
    async findDetailed(id: string) {
      const [row] = await detailed().where(eq(sales.id, id));
      return row;
    },
    async findDetailedByAuction(auctionId: string) {
      const [row] = await detailed().where(eq(sales.auctionId, auctionId));
      return row;
    },
    /** Sales waiting for the buyer (contract / payments): candidates for deadline reminders. */
    async listOpenDetailed() {
      return detailed().where(
        inArray(sales.status, ['AWAITING_CONTRACT', 'CONTRACT_SIGNED', 'DOWN_PAYMENT_PAID']),
      );
    },
    async listByStatus(status: SaleStatus): Promise<SaleRow[]> {
      return db.query.sales.findMany({ where: and(eq(sales.status, status)) });
    },
  };
}
