import { eq } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { bidderProfiles } from '../schema';

export type BidderProfileRow = typeof bidderProfiles.$inferSelect;
export type NewBidderProfile = typeof bidderProfiles.$inferInsert;
export type VerificationStatus = BidderProfileRow['status'];
export type BidderProfilePatch = Partial<
  Omit<NewBidderProfile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

export function bidderProfilesRepository(db: Executor) {
  return {
    async create(data: NewBidderProfile): Promise<BidderProfileRow> {
      return one(await db.insert(bidderProfiles).values(data).returning());
    },
    async findById(id: string): Promise<BidderProfileRow | undefined> {
      return db.query.bidderProfiles.findFirst({ where: eq(bidderProfiles.id, id) });
    },
    async findByUserId(userId: string): Promise<BidderProfileRow | undefined> {
      return db.query.bidderProfiles.findFirst({ where: eq(bidderProfiles.userId, userId) });
    },
    async update(id: string, patch: BidderProfilePatch): Promise<BidderProfileRow | undefined> {
      const [row] = await db
        .update(bidderProfiles)
        .set(patch)
        .where(eq(bidderProfiles.id, id))
        .returning();
      return row;
    },
    async setStatus(
      id: string,
      status: VerificationStatus,
      verifiedBy: string | null,
      at: Date,
    ): Promise<BidderProfileRow | undefined> {
      const [row] = await db
        .update(bidderProfiles)
        .set({ status, verifiedBy, verifiedAt: status === 'VERIFIED' ? at : null })
        .where(eq(bidderProfiles.id, id))
        .returning();
      return row;
    },
  };
}
