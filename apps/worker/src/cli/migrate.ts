/**
 * Applies pending DB migrations. Runs as the one-shot `migrate` service before web/worker start:
 *   node dist/cli/migrate.js
 * The image ships the SQL files at /app/drizzle (override with MIGRATIONS_DIR).
 */
import { runMigrations } from '@domik/db';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const folder = process.env.MIGRATIONS_DIR ?? '/app/drizzle';
await runMigrations(url, folder);
console.log(`Migrations applied from ${folder}.`);
