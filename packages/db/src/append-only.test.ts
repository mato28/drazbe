import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type DbHandle } from './client';
import { auditLog, bids } from './schema';
import { chainedBid, createAuctionFixture, dbError, sha256Hex } from './testing/fixtures';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(inject('databaseUrl'), { max: 4 });
});
afterAll(async () => {
  await handle.close();
});

describe('bids table is append-only', () => {
  async function auctionWithTwoBids() {
    const f = await createAuctionFixture(handle.db);
    const genesis = sha256Hex(f.auction.id);
    const b1 = await f.repos.bids.append(
      chainedBid(f.auction.id, f.registration.id, 1, genesis, 10_000_000n),
    );
    const b2 = await f.repos.bids.append(
      chainedBid(f.auction.id, f.registration.id, 2, b1.hash, 10_100_000n),
    );
    return { ...f, b1, b2 };
  }

  it('accepts a correctly chained insert', async () => {
    const { b1, b2, repos, auction } = await auctionWithTwoBids();
    expect(b1.seq).toBe(1);
    expect(b2.prevHash).toBe(b1.hash);
    const all = await repos.bids.listByAuction(auction.id);
    expect(all.map((b) => b.amountCents)).toEqual([10_000_000n, 10_100_000n]);
  });

  it('blocks UPDATE of any bid column', async () => {
    const { b1 } = await auctionWithTwoBids();
    const msg = await dbError(
      handle.db.execute(sql`UPDATE ${bids} SET amount_cents = 1 WHERE id = ${b1.id}`),
    );
    expect(msg).toMatch(/UPDATE on table "bids" is not allowed: table is append-only/);

    const reread = await handle.db.execute<{ amount_cents: string }>(
      sql`SELECT amount_cents FROM ${bids} WHERE id = ${b1.id}`,
    );
    expect(reread[0]?.amount_cents).toBe('10000000');
  });

  it('blocks UPDATE of server_time and hash (tampering)', async () => {
    const { b1 } = await auctionWithTwoBids();
    expect(
      await dbError(
        handle.db.execute(
          sql`UPDATE ${bids} SET server_time = now() - interval '1 hour' WHERE id = ${b1.id}`,
        ),
      ),
    ).toMatch(/append-only/);
    expect(
      await dbError(
        handle.db.execute(sql`UPDATE ${bids} SET hash = ${sha256Hex('x')} WHERE id = ${b1.id}`),
      ),
    ).toMatch(/append-only/);
  });

  it('blocks DELETE', async () => {
    const { b2 } = await auctionWithTwoBids();
    const msg = await dbError(handle.db.execute(sql`DELETE FROM ${bids} WHERE id = ${b2.id}`));
    expect(msg).toMatch(/DELETE on table "bids" is not allowed: table is append-only/);
  });

  it('blocks TRUNCATE', async () => {
    await auctionWithTwoBids();
    const msg = await dbError(handle.db.execute(sql`TRUNCATE ${bids} CASCADE`));
    expect(msg).toMatch(/TRUNCATE on table "bids" is not allowed/);
  });

  it('allows setting tsa_token exactly once, and nothing else alongside it', async () => {
    const { b1, repos } = await auctionWithTwoBids();

    expect(
      await dbError(
        handle.db.execute(
          sql`UPDATE ${bids} SET tsa_token = 'tok', amount_cents = 1 WHERE id = ${b1.id}`,
        ),
      ),
    ).toMatch(/append-only/);

    expect(await repos.bids.attachTsaToken(b1.id, 'token-1')).toBe(true);
    // Repository refuses silently once set …
    expect(await repos.bids.attachTsaToken(b1.id, 'token-2')).toBe(false);
    // … and the DB refuses a direct overwrite or clearing.
    expect(
      await dbError(
        handle.db.execute(sql`UPDATE ${bids} SET tsa_token = 'token-2' WHERE id = ${b1.id}`),
      ),
    ).toMatch(/append-only/);
    expect(
      await dbError(
        handle.db.execute(sql`UPDATE ${bids} SET tsa_token = NULL WHERE id = ${b1.id}`),
      ),
    ).toMatch(/append-only/);
  });

  it('rejects a gap in seq', async () => {
    const { b2, auction, registration, repos } = await auctionWithTwoBids();
    const msg = await dbError(
      repos.bids.append(chainedBid(auction.id, registration.id, 4, b2.hash, 10_300_000n)),
    );
    expect(msg).toMatch(/bid chain broken .* expected seq 3, got 4/);
  });

  it('rejects a prev_hash that does not match the previous bid', async () => {
    const { auction, registration, repos } = await auctionWithTwoBids();
    const msg = await dbError(
      repos.bids.append(
        chainedBid(auction.id, registration.id, 3, sha256Hex('forged'), 10_200_000n),
      ),
    );
    expect(msg).toMatch(/prev_hash does not match/);
  });

  it('rejects a first bid whose prev_hash is not sha256(auctionId)', async () => {
    const { auction, registration, repos } = await createAuctionFixture(handle.db);
    const msg = await dbError(
      repos.bids.append(chainedBid(auction.id, registration.id, 1, sha256Hex('nope'), 10_000_000n)),
    );
    expect(msg).toMatch(/prev_hash does not match/);
  });
});

describe('audit_log table is append-only', () => {
  async function entry() {
    const f = await createAuctionFixture(handle.db);
    return f.repos.auditLog.append({
      actorId: f.trusteeUser.id,
      entity: 'auction',
      entityId: f.auction.id,
      action: 'auction.published',
      before: { status: 'DRAFT' },
      after: { status: 'PUBLISHED' },
    });
  }

  it('accepts inserts', async () => {
    const row = await entry();
    expect(row.after).toEqual({ status: 'PUBLISHED' });
  });

  it('blocks UPDATE', async () => {
    const row = await entry();
    const msg = await dbError(
      handle.db.execute(sql`UPDATE ${auditLog} SET action = 'tampered' WHERE id = ${row.id}`),
    );
    expect(msg).toMatch(/UPDATE on table "audit_log" is not allowed: table is append-only/);
  });

  it('blocks DELETE', async () => {
    const row = await entry();
    const msg = await dbError(handle.db.execute(sql`DELETE FROM ${auditLog} WHERE id = ${row.id}`));
    expect(msg).toMatch(/DELETE on table "audit_log" is not allowed: table is append-only/);
  });

  it('blocks TRUNCATE', async () => {
    await entry();
    const msg = await dbError(handle.db.execute(sql`TRUNCATE ${auditLog}`));
    expect(msg).toMatch(/TRUNCATE on table "audit_log" is not allowed/);
  });
});
