import { asc, eq } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { lots } from '../schema';

export type LotRow = typeof lots.$inferSelect;
export type NewLot = typeof lots.$inferInsert;
export type LotPatch = Partial<Omit<NewLot, 'id' | 'caseId' | 'createdAt' | 'updatedAt'>>;

export function lotsRepository(db: Executor) {
  return {
    async create(data: NewLot): Promise<LotRow> {
      return one(await db.insert(lots).values(data).returning());
    },
    async findById(id: string): Promise<LotRow | undefined> {
      return db.query.lots.findFirst({ where: eq(lots.id, id) });
    },
    /** Lot together with its insolvency case (for ownership checks). */
    async findWithCase(id: string) {
      return db.query.lots.findFirst({ where: eq(lots.id, id), with: { case: true } });
    },
    async listByCase(caseId: string): Promise<LotRow[]> {
      return db.query.lots.findMany({
        where: eq(lots.caseId, caseId),
        orderBy: asc(lots.createdAt),
      });
    },
    async update(id: string, patch: LotPatch): Promise<LotRow | undefined> {
      const [row] = await db.update(lots).set(patch).where(eq(lots.id, id)).returning();
      return row;
    },
  };
}
