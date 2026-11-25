import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
/** A transaction handle. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything repositories can run queries on: the pool or an open transaction. */
export type Executor = Database | Transaction;

export interface DbHandle {
  db: Database;
  /** Subscribe to a Postgres NOTIFY channel. Returns an unsubscribe function. */
  listen: (channel: string, onNotify: (payload: string) => void) => Promise<() => Promise<void>>;
  /** Close all pooled connections (call on graceful shutdown). */
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Max pooled connections. */
  max?: number;
}

/**
 * Create a Drizzle database handle. Connections are opened lazily on first query.
 * Only repositories in this package should use the returned `db`.
 */
export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const sql = postgres(url, {
    max: options.max ?? 10,
    onnotice: () => undefined,
    connection: { TimeZone: 'UTC' },
  });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return {
    db,
    listen: async (channel, onNotify) => {
      const sub = await sql.listen(channel, onNotify);
      return () => sub.unlisten();
    },
    close: () => sql.end({ timeout: 5 }),
  };
}
