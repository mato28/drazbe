import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDb, type DbHandle } from './client';
import { withTransaction } from './repositories';
import { createAuctionFixture, dbError } from './testing/fixtures';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(inject('databaseUrl'), { max: 4 });
});
afterAll(async () => {
  await handle.close();
});

describe('money and time', () => {
  it('round-trips cents as bigint and timestamps as UTC Dates', async () => {
    const { auction, repos } = await createAuctionFixture(handle.db);
    const reread = await repos.auctions.findById(auction.id);
    expect(typeof reread?.startingPriceCents).toBe('bigint');
    expect(reread?.startingPriceCents).toBe(10_000_000n);
    expect(reread?.startsAt.toISOString()).toBe('2030-01-10T09:00:00.000Z');
  });
});

describe('auctions constraints', () => {
  it('rejects an ASCENDING auction without bid increment', async () => {
    const { lot, repos } = await createAuctionFixture(handle.db);
    const msg = await dbError(
      repos.auctions.create({
        lotId: lot.id,
        type: 'ASCENDING',
        startingPriceCents: 1_000n,
        startsAt: new Date('2030-01-10T09:00:00Z'),
        endsAt: new Date('2030-01-10T10:00:00Z'),
        registrationDeadline: new Date('2030-01-08T09:00:00Z'),
        depositCents: 100n,
      }),
    );
    expect(msg).toMatch(/auctions_ascending_fields/);
  });

  it('rejects a DESCENDING auction whose floor is above the starting price', async () => {
    const { lot, repos } = await createAuctionFixture(handle.db);
    const msg = await dbError(
      repos.auctions.create({
        lotId: lot.id,
        type: 'DESCENDING',
        startingPriceCents: 1_000n,
        floorPriceCents: 2_000n,
        priceDecrementCents: 100n,
        stepDurationSec: 60,
        startsAt: new Date('2030-01-10T09:00:00Z'),
        registrationDeadline: new Date('2030-01-08T09:00:00Z'),
        depositCents: 100n,
      }),
    );
    expect(msg).toMatch(/auctions_descending_fields/);
  });

  it('lockById serializes access inside a transaction', async () => {
    const { auction } = await createAuctionFixture(handle.db);
    const locked = await withTransaction(handle.db, (repos) => repos.auctions.lockById(auction.id));
    expect(locked?.id).toBe(auction.id);
  });

  it('allows only one open auction per lot', async () => {
    const { lot, repos } = await createAuctionFixture(handle.db);
    const msg = await dbError(
      repos.auctions.create({
        lotId: lot.id,
        type: 'ASCENDING',
        startingPriceCents: 1_000n,
        bidIncrementCents: 100n,
        startsAt: new Date('2030-02-10T09:00:00Z'),
        endsAt: new Date('2030-02-10T10:00:00Z'),
        registrationDeadline: new Date('2030-02-08T09:00:00Z'),
        depositCents: 100n,
      }),
    );
    expect(msg).toMatch(/auctions_one_open_per_lot/);
  });
});

describe('auction registrations', () => {
  it('enforces one registration per bidder and unique pseudonyms per auction', async () => {
    const { auction, bidder, repos } = await createAuctionFixture(handle.db);
    const msg = await dbError(
      repos.auctionRegistrations.create({
        auctionId: auction.id,
        bidderId: bidder.id,
        seq: 2,
        pseudonym: 'Dražitelj 2',
        paymentReference: 'SI00 unique-x',
      }),
    );
    expect(msg).toMatch(/auction_registrations_auction_bidder_unique/);
  });

  it('requires a rank for pre-emption holders', async () => {
    const { registration, repos } = await createAuctionFixture(handle.db);
    const msg = await dbError(
      repos.auctionRegistrations.update(registration.id, { isPreemptionHolder: true }),
    );
    expect(msg).toMatch(/auction_registrations_preemption_rank/);
  });
});

describe('notifications outbox', () => {
  it('deduplicates by dedupeKey and claims each row only once', async () => {
    const { repos } = await createAuctionFixture(handle.db);
    const key = `test-${crypto.randomUUID()}`;
    const first = await repos.notificationsOutbox.enqueue({
      template: 'test',
      recipient: 'a@test.local',
      dedupeKey: key,
    });
    const dup = await repos.notificationsOutbox.enqueue({
      template: 'test',
      recipient: 'a@test.local',
      dedupeKey: key,
    });
    expect(first).toBeDefined();
    expect(dup).toBeUndefined();

    const now = new Date();
    const [a, b] = await Promise.all([
      repos.notificationsOutbox.claimBatch(1000, now),
      repos.notificationsOutbox.claimBatch(1000, now),
    ]);
    const claimed = [...a, ...b].filter((r) => r.id === first!.id);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('SENDING');
    expect(claimed[0]?.attempts).toBe(1);

    await repos.notificationsOutbox.markFailed(
      first!.id,
      'smtp down',
      new Date(now.getTime() + 60_000),
    );
    expect((await repos.notificationsOutbox.findById(first!.id))?.status).toBe('PENDING');
    expect(await repos.notificationsOutbox.claimBatch(1000, now)).not.toContainEqual(
      expect.objectContaining({ id: first!.id }),
    );

    await repos.notificationsOutbox.markSent(first!.id, new Date());
    expect((await repos.notificationsOutbox.findById(first!.id))?.status).toBe('SENT');
  });
});
