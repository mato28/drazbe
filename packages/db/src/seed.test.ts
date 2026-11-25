import { verifyPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type DbHandle } from './client';
import { createRepositories } from './repositories';
import { accounts } from './schema';
import { seed, SEED_USERS } from './seed';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(inject('databaseUrl'), { max: 2 });
});
afterAll(async () => {
  await handle.close();
});

describe('seed', () => {
  it('creates admin, trustee with case + lot, and two verified bidders; is idempotent', async () => {
    const url = inject('databaseUrl');
    expect(await seed(url)).toBe('seeded');
    expect(await seed(url)).toBe('skipped');

    const repos = createRepositories(handle.db);
    for (const u of Object.values(SEED_USERS)) {
      const user = await repos.users.findByEmail(u.email);
      expect(user?.role).toBe(u.role);
      expect(user?.emailVerified).toBe(true);
    }

    const trusteeUser = await repos.users.findByEmail(SEED_USERS.trustee.email);
    const trustee = await repos.trustees.findByUserId(trusteeUser!.id);
    const cases = await repos.insolvencyCases.listByTrustee(trustee!.id);
    expect(cases).toHaveLength(1);
    const lots = await repos.lots.listByCase(cases[0]!.id);
    expect(lots).toHaveLength(3);
    expect(lots[0]?.appraisalValueCents).toBe(18_500_000n);
    const auctions = await repos.auctions.listByTrustee(trustee!.id);
    expect(auctions.map((a) => a.status)).toEqual(['PUBLISHED', 'PUBLISHED']);

    for (const u of [SEED_USERS.bidderPerson, SEED_USERS.bidderCompany]) {
      const user = await repos.users.findByEmail(u.email);
      const profile = await repos.bidderProfiles.findByUserId(user!.id);
      expect(profile?.status).toBe('VERIFIED');
    }
  });

  it('stores a Better Auth compatible password hash', async () => {
    const repos = createRepositories(handle.db);
    const admin = await repos.users.findByEmail(SEED_USERS.admin.email);
    const [account] = await handle.db.select().from(accounts).where(eq(accounts.userId, admin!.id));
    expect(account?.providerId).toBe('credential');
    expect(await verifyPassword({ hash: account!.password!, password: 'Domik-geslo-2026' })).toBe(
      true,
    );
  });
});
