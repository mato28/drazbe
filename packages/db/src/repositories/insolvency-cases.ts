import { asc, eq } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { insolvencyCases } from '../schema';

export type InsolvencyCaseRow = typeof insolvencyCases.$inferSelect;
export type NewInsolvencyCase = typeof insolvencyCases.$inferInsert;
export type InsolvencyCasePatch = Partial<
  Omit<NewInsolvencyCase, 'id' | 'trusteeId' | 'createdAt' | 'updatedAt'>
>;

export function insolvencyCasesRepository(db: Executor) {
  return {
    async create(data: NewInsolvencyCase): Promise<InsolvencyCaseRow> {
      return one(await db.insert(insolvencyCases).values(data).returning());
    },
    async findById(id: string): Promise<InsolvencyCaseRow | undefined> {
      return db.query.insolvencyCases.findFirst({ where: eq(insolvencyCases.id, id) });
    },
    async update(id: string, patch: InsolvencyCasePatch): Promise<InsolvencyCaseRow | undefined> {
      const [row] = await db
        .update(insolvencyCases)
        .set(patch)
        .where(eq(insolvencyCases.id, id))
        .returning();
      return row;
    },
    async listByTrustee(trusteeId: string): Promise<InsolvencyCaseRow[]> {
      return db.query.insolvencyCases.findMany({
        where: eq(insolvencyCases.trusteeId, trusteeId),
        orderBy: asc(insolvencyCases.createdAt),
      });
    },
  };
}
