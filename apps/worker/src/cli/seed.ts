/**
 * Seeds fictitious test accounts and auctions on a TEST environment (staging):
 *   ALLOW_DEMO_DATA=true SEED_PASSWORD=... node dist/cli/seed.js
 * Refuses unless ALLOW_DEMO_DATA=true, and requires an explicit SEED_PASSWORD (the environment
 * is reachable from the internet, so the dev default password must not be used).
 */
import { seed, SEED_USERS } from '@domik/db/seed';

if (process.env.ALLOW_DEMO_DATA !== 'true') {
  console.error('Refusing to seed: set ALLOW_DEMO_DATA=true (test environments only).');
  process.exit(1);
}
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10) {
  console.error('SEED_PASSWORD must be set (at least 10 characters).');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const result = await seed(url);
if (result === 'skipped') {
  console.log('Seed skipped: data already present.');
} else {
  console.log('Seeded. All users have the password from SEED_PASSWORD:');
  for (const u of Object.values(SEED_USERS)) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}
