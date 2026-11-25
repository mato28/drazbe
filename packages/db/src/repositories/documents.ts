import { and, asc, eq } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { documents } from '../schema';

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentOwnerType = DocumentRow['ownerType'];

export function documentsRepository(db: Executor) {
  return {
    async create(data: NewDocument): Promise<DocumentRow> {
      return one(await db.insert(documents).values(data).returning());
    },
    async findById(id: string): Promise<DocumentRow | undefined> {
      return db.query.documents.findFirst({ where: eq(documents.id, id) });
    },
    async delete(id: string): Promise<void> {
      await db.delete(documents).where(eq(documents.id, id));
    },
    async listByOwner(ownerType: DocumentOwnerType, ownerId: string): Promise<DocumentRow[]> {
      return db.query.documents.findMany({
        where: and(eq(documents.ownerType, ownerType), eq(documents.ownerId, ownerId)),
        orderBy: asc(documents.createdAt),
      });
    },
  };
}
