import { asc, and, eq } from 'drizzle-orm';
import { one } from './_util';
import { type Executor } from '../client';
import { auditLog } from '../schema';

export type AuditLogRow = typeof auditLog.$inferSelect;
export interface AuditEntry {
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  at?: Date;
}

/** Append-only. Values in before/after must be JSON-serializable (convert bigint to string). */
export function auditLogRepository(db: Executor) {
  return {
    async append(entry: AuditEntry): Promise<AuditLogRow> {
      return one(
        await db
          .insert(auditLog)
          .values({
            actorId: entry.actorId,
            entity: entry.entity,
            entityId: entry.entityId,
            action: entry.action,
            before: entry.before ?? null,
            after: entry.after ?? null,
            ...(entry.at ? { at: entry.at } : {}),
          })
          .returning(),
      );
    },
    async listForEntity(entity: string, entityId: string): Promise<AuditLogRow[]> {
      return db.query.auditLog.findMany({
        where: and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId)),
        orderBy: asc(auditLog.id),
      });
    },
  };
}
