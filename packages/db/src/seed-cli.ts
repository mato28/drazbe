/** Dev CLI for the seed: `pnpm db:seed`. */
import { seed, SEED_PASSWORD, SEED_USERS } from './seed';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed in production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const result = await seed(url);
if (result === 'skipped') {
  console.log('Seed skipped: data already present (use `pnpm db:reset` to start over).');
} else {
  console.log(`Seeded. All users have the password "${SEED_PASSWORD}":`);
  for (const u of Object.values(SEED_USERS)) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}
