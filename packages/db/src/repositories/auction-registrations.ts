import { and, asc, desc, eq, max } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import {
  auctionRegistrations,
  auctions,
  bidderProfiles,
  insolvencyCases,
  lots,
  users,
} from '../schema';

export type AuctionRegistrationRow = typeof auctionRegistrations.$inferSelect;
export type NewAuctionRegistration = typeof auctionRegistrations.$inferInsert;
export type AuctionRegistrationPatch = Partial<
  Omit<NewAuctionRegistration, 'id' | 'auctionId' | 'bidderId' | 'createdAt' | 'updatedAt'>
>;

export function auctionRegistrationsRepository(db: Executor) {
  return {
    async create(data: NewAuctionRegistration): Promise<AuctionRegistrationRow> {
      return one(await db.insert(auctionRegistrations).values(data).returning());
    },
    async findById(id: string): Promise<AuctionRegistrationRow | undefined> {
      return db.query.auctionRegistrations.findFirst({ where: eq(auctionRegistrations.id, id) });
    },
    async findByAuctionAndBidder(
      auctionId: string,
      bidderId: string,
    ): Promise<AuctionRegistrationRow | undefined> {
      return db.query.auctionRegistrations.findFirst({
        where: and(
          eq(auctionRegistrations.auctionId, auctionId),
          eq(auctionRegistrations.bidderId, bidderId),
        ),
      });
    },
    async findByPaymentReference(ref: string): Promise<AuctionRegistrationRow | undefined> {
      return db.query.auctionRegistrations.findFirst({
        where: eq(auctionRegistrations.paymentReference, ref),
      });
    },
    async listByAuction(auctionId: string): Promise<AuctionRegistrationRow[]> {
      return db.query.auctionRegistrations.findMany({
        where: eq(auctionRegistrations.auctionId, auctionId),
        orderBy: asc(auctionRegistrations.createdAt),
      });
    },
    /** Next registration number in the auction. Call with the auction row locked. */
    async nextSeq(auctionId: string): Promise<number> {
      const [row] = await db
        .select({ last: max(auctionRegistrations.seq) })
        .from(auctionRegistrations)
        .where(eq(auctionRegistrations.auctionId, auctionId));
      return (row?.last ?? 0) + 1;
    },

    /** Registration with everything a review / payment screen needs. */
    async findDetailed(id: string) {
      const [row] = await db
        .select({
          registration: auctionRegistrations,
          auction: auctions,
          lot: lots,
          case: insolvencyCases,
          bidder: bidderProfiles,
          user: { id: users.id, email: users.email, phone: users.phone, name: users.name },
        })
        .from(auctionRegistrations)
        .innerJoin(auctions, eq(auctionRegistrations.auctionId, auctions.id))
        .innerJoin(lots, eq(auctions.lotId, lots.id))
        .innerJoin(insolvencyCases, eq(lots.caseId, insolvencyCases.id))
        .innerJoin(bidderProfiles, eq(auctionRegistrations.bidderId, bidderProfiles.id))
        .innerJoin(users, eq(bidderProfiles.userId, users.id))
        .where(eq(auctionRegistrations.id, id));
      return row;
    },

    /** All registrations of an auction with the bidder's profile (trustee view). */
    async listByAuctionWithBidder(auctionId: string) {
      return db
        .select({ registration: auctionRegistrations, bidder: bidderProfiles })
        .from(auctionRegistrations)
        .innerJoin(bidderProfiles, eq(auctionRegistrations.bidderId, bidderProfiles.id))
        .where(eq(auctionRegistrations.auctionId, auctionId))
        .orderBy(asc(auctionRegistrations.seq));
    },

    /** A bidder's own registrations with the auction and lot, newest first. */
    async listByBidder(bidderId: string) {
      return db
        .select({
          registration: auctionRegistrations,
          auction: auctions,
          lotTitle: lots.title,
        })
        .from(auctionRegistrations)
        .innerJoin(auctions, eq(auctionRegistrations.auctionId, auctions.id))
        .innerJoin(lots, eq(auctions.lotId, lots.id))
        .where(eq(auctionRegistrations.bidderId, bidderId))
        .orderBy(desc(auctionRegistrations.createdAt));
    },

    /** Registrations in the trustee's auctions whose deposit is still unpaid (statement matching). */
    async listAwaitingDepositByTrustee(trusteeId: string) {
      return db
        .select({
          registration: auctionRegistrations,
          bidder: bidderProfiles,
          depositCents: auctions.depositCents,
          auctionNumber: auctions.number,
          lotTitle: lots.title,
          caseNumber: insolvencyCases.caseNumber,
          estateIban: insolvencyCases.estateIban,
        })
        .from(auctionRegistrations)
        .innerJoin(auctions, eq(auctionRegistrations.auctionId, auctions.id))
        .innerJoin(lots, eq(auctions.lotId, lots.id))
        .innerJoin(insolvencyCases, eq(lots.caseId, insolvencyCases.id))
        .innerJoin(bidderProfiles, eq(auctionRegistrations.bidderId, bidderProfiles.id))
        .where(
          and(
            eq(insolvencyCases.trusteeId, trusteeId),
            eq(auctionRegistrations.depositStatus, 'PENDING'),
          ),
        )
        .orderBy(asc(auctionRegistrations.createdAt));
    },

    /** Has this bidder registered in any auction of the trustee? (PII access check.) */
    async bidderHasRegistrationWithTrustee(bidderId: string, trusteeId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: auctionRegistrations.id })
        .from(auctionRegistrations)
        .innerJoin(auctions, eq(auctionRegistrations.auctionId, auctions.id))
        .innerJoin(lots, eq(auctions.lotId, lots.id))
        .innerJoin(insolvencyCases, eq(lots.caseId, insolvencyCases.id))
        .where(
          and(
            eq(auctionRegistrations.bidderId, bidderId),
            eq(insolvencyCases.trusteeId, trusteeId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
    async update(
      id: string,
      patch: AuctionRegistrationPatch,
    ): Promise<AuctionRegistrationRow | undefined> {
      const [row] = await db
        .update(auctionRegistrations)
        .set(patch)
        .where(eq(auctionRegistrations.id, id))
        .returning();
      return row;
    },
  };
}
