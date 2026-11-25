/** Dev only: drop all tables, re-run migrations. Run `pnpm db:seed` afterwards (db:reset does). */
import postgres from 'postgres';
import { runMigrations } from './migrate';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset the database in production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => undefined });
await sql.unsafe(
  'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
);
await sql.end();
await runMigrations(url);
console.log('Database reset and migrated.');
