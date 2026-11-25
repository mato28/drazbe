import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Apply all pending migrations (used by tests and deploy scripts). Bundled callers (the worker
 * image) pass `folder` explicitly, since `import.meta.url` no longer points into this package.
 */
export async function runMigrations(url: string, folder: string = migrationsFolder): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(sql), { migrationsFolder: folder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
