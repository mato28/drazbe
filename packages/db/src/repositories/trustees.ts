import { eq } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { trustees } from '../schema';

export type TrusteeRow = typeof trustees.$inferSelect;
export type NewTrustee = typeof trustees.$inferInsert;

export function trusteesRepository(db: Executor) {
  return {
    async create(data: NewTrustee): Promise<TrusteeRow> {
      return one(await db.insert(trustees).values(data).returning());
    },
    async findById(id: string): Promise<TrusteeRow | undefined> {
      return db.query.trustees.findFirst({ where: eq(trustees.id, id) });
    },
    async findByUserId(userId: string): Promise<TrusteeRow | undefined> {
      return db.query.trustees.findFirst({ where: eq(trustees.userId, userId) });
    },
    async markVerified(id: string, at: Date): Promise<TrusteeRow | undefined> {
      const [row] = await db
        .update(trustees)
        .set({ verifiedAt: at })
        .where(eq(trustees.id, id))
        .returning();
      return row;
    },
  };
}
