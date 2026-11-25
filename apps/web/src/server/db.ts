import 'server-only';
import { createDb, createRepositories, type DbHandle, type Repositories } from '@domik/db';
import { serverConfig } from './config';

// Reuse one pool across dev hot reloads.
const globalForDb = globalThis as unknown as { __domikDb?: DbHandle };

export function dbHandle(): DbHandle {
  globalForDb.__domikDb ??= createDb(serverConfig().DATABASE_URL, { max: 10 });
  return globalForDb.__domikDb;
}

export function repositories(): Repositories {
  return createRepositories(dbHandle().db);
}
