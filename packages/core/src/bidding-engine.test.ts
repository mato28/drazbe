import { randomUUID } from 'node:crypto';
import { createDb, createUnitOfWork } from '@domik/db';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import * as auctionService from './auctions/service';
import { advanceAuction } from './bidding/clock';
import * as caseService from './cases/service';
import * as lotService from './lots/service';
import {
  acceptCurrentPrice,
  type BiddingContext,
  matchAsPreemptionHolder,
  placeBid,
} from './bidding/engine';
import { getLiveState } from './bidding/live';
import { getAuctionOutcome } from './bidding/outcome';
import { verifyAuction } from './bidding/verify';
import { type Actor } from './context';
import { DomainError } from './errors';
import { liveAuction, type LiveFixture } from './testing/bidding';
import {
  ascendingInput,
  caseInput,
  createHarness,
  descendingInput,
  domainError,
  type Harness,
  lotInput,
} from './testing/harness';

let h: Harness;
beforeAll(() => {
  h = createHarness(inject('databaseUrl'));
});
afterAll(async () => {
  await h.close();
});

const START = new Date('2030-01-10T09:00:00Z');
const END = new Date('2030-01-10T10:00:00Z');
const at = (sec: number): Date => new Date(START.getTime() + sec * 1000);
const key = (): string => randomUUID();

const bid = (actor: Actor, auctionId: string, amountCents: bigint, idempotencyKey = key()) =>
  placeBid(h.ctx, actor, auctionId, { amountCents, idempotencyKey });
const accept = (
  actor: Actor,
  auctionId: string,
  expectedPriceCents: bigint,
  ctx: BiddingContext = h.ctx,
) => acceptCurrentPrice(ctx, actor, auctionId, { expectedPriceCents, idempotencyKey: key() });
const match = (actor: Actor, auctionId: string, expectedPriceCents: bigint) =>
  matchAsPreemptionHolder(h.ctx, actor, auctionId, { expectedPriceCents, idempotencyKey: key() });

async function tick(f: LiveFixture) {
  return advanceAuction(h.ctx, f.auction.id);
}

describe('worker clock: lifecycle', () => {
  it('closes registration at the deadline and starts the auction at starts_at', async () => {
    const f = await liveAuction(h, ascendingInput(), { start: false });
    expect(f.auction.status).toBe('PUBLISHED');

    h.clock.set(new Date('2030-01-08T09:00:00Z'));
    expect((await tick(f)).actions).toEqual(['registration_closed']);
    h.clock.set(new Date(START.getTime() - 1));
    expect((await tick(f)).actions).toEqual([]);
    h.clock.set(START);
    expect(await tick(f)).toMatchObject({ actions: ['started'], status: 'LIVE' });
    expect((await tick(f)).actions).toEqual([]); // idempotent
  });

  it('catches up several transitions if the worker was down', async () => {
    const f = await liveAuction(h, ascendingInput(), { start: false });
    h.clock.set(at(5));
    expect((await tick(f)).actions).toEqual(['registration_closed', 'started']);
  });

  it('two worker instances never apply the same transition twice', async () => {
    const f = await liveAuction(h, ascendingInput(), { start: false });
    const other = createDb(inject('databaseUrl'), { max: 4 });
    try {
      const ctx2: BiddingContext = {
        uow: createUnitOfWork(other.db),
        clock: h.clock,
        appUrl: h.ctx.appUrl,
      };
      h.clock.set(START);
      const results = await Promise.all([
        advanceAuction(h.ctx, f.auction.id),
        advanceAuction(ctx2, f.auction.id),
        advanceAuction(h.ctx, f.auction.id),
        advanceAuction(ctx2, f.auction.id),
      ]);
      expect(results.flatMap((r) => r.actions).filter((a) => a === 'started')).toHaveLength(1);
      const audit = await h.ctx.uow.repos.auditLog.listForEntity('auction', f.auction.id);
      expect(audit.filter((e) => e.action === 'auction.started')).toHaveLength(1);
    } finally {
      await other.close();
    }
  });
});

describe('ascending: placeBid', () => {
  it('validates amounts and records a binding bid', async () => {
    const f = await liveAuction(h, ascendingInput());
    const [a, b] = f.bidders.map((x) => x.actor) as [Actor, Actor];
    h.clock.set(at(60));

    const low = await domainError(bid(a, f.auction.id, 9_999_999n));
    expect(low.code).toBe('VALIDATION');
    expect(low.fields?.amountCents).toMatch(/izklicni ceni/);

    const first = await bid(a, f.auction.id, 10_000_000n);
    expect(first.bid).toMatchObject({ seq: 1, kind: 'BID', pseudonym: 'Dražitelj 1' });
    expect(first.auction).toMatchObject({ status: 'LIVE', extended: false, endsAt: END });

    expect((await domainError(bid(a, f.auction.id, 20_000_000n))).message).toMatch(/že najvišja/);
    expect((await domainError(bid(b, f.auction.id, 10_099_999n))).code).toBe('VALIDATION');
    const second = await bid(b, f.auction.id, 10_100_000n);
    expect(second.bid.seq).toBe(2);

    const auction = await f.reload();
    expect(auction.currentPriceCents).toBe(10_100_000n);
    expect(auction.leadingRegistrationId).toBe(f.bidders[1]!.registration.id);

    const audit = await h.ctx.uow.repos.auditLog.listForEntity('auction', f.auction.id);
    expect(audit.filter((e) => e.action === 'bid.bid')).toHaveLength(2);
  });

  it('rejects bids before the start, after the end, and from unapproved bidders', async () => {
    const f = await liveAuction(h, ascendingInput(), { start: false });
    const [a] = f.bidders.map((x) => x.actor) as [Actor];
    expect((await domainError(bid(a, f.auction.id, 10_000_000n))).code).toBe('CONFLICT');

    h.clock.set(START);
    await tick(f);
    const outsider = await h.bidder();
    expect((await domainError(bid(outsider, f.auction.id, 10_000_000n))).code).toBe('FORBIDDEN');
    const trustee = await domainError(bid(f.trustee, f.auction.id, 10_000_000n));
    expect(trustee.code).toBe('FORBIDDEN');

    await h.ctx.uow.repos.auctionRegistrations.update(f.bidders[1]!.registration.id, {
      status: 'PENDING',
    });
    const pending = await domainError(bid(f.bidders[1]!.actor, f.auction.id, 10_000_000n));
    expect(pending.code).toBe('FORBIDDEN');

    // Exactly at ends_at the auction is over, even before the worker closes it.
    h.clock.set(END);
    expect((await domainError(bid(a, f.auction.id, 10_000_000n))).message).toMatch(/končala/);
  });

  it('is idempotent per request key', async () => {
    const f = await liveAuction(h, ascendingInput());
    const [a] = f.bidders.map((x) => x.actor) as [Actor];
    h.clock.set(at(10));
    const k = key();
    const [r1, r2] = await Promise.all([
      bid(a, f.auction.id, 10_000_000n, k),
      bid(a, f.auction.id, 10_000_000n, k),
    ]);
    expect(r1.bid.id).toBe(r2.bid.id);
    expect([r1.duplicate, r2.duplicate].sort()).toEqual([false, true]);
    expect(await h.ctx.uow.repos.bids.listByAuction(f.auction.id)).toHaveLength(1);

    const reuse = await domainError(bid(a, f.auction.id, 12_000_000n, k));
    expect(reuse.code).toBe('CONFLICT');
  });

  it('publishes an auction_events NOTIFY on commit', async () => {
    const f = await liveAuction(h, ascendingInput());
    const received: string[] = [];
    const unlisten = await h.handle.listen('auction_events', (p) => received.push(p));
    try {
      h.clock.set(at(10));
      await bid(f.bidders[0]!.actor, f.auction.id, 10_000_000n);
      await expect.poll(() => received.length, { timeout: 5000 }).toBeGreaterThan(0);
      expect(received.map((p) => JSON.parse(p) as unknown)).toContainEqual({
        auctionId: f.auction.id,
        type: 'bid',
      });
    } finally {
      await unlisten();
    }
  });
});

describe('ascending: anti-sniping at the boundary (window 120 s, extension 120 s)', () => {
  async function bidSecondsBeforeEnd(sec: number) {
    const f = await liveAuction(h, ascendingInput());
    h.clock.set(new Date(END.getTime() - sec * 1000));
    const r = await bid(f.bidders[0]!.actor, f.auction.id, 10_000_000n);
    return { r, f };
  }

  it('121 s before the end: not extended', async () => {
    const { r } = await bidSecondsBeforeEnd(121);
    expect(r.auction).toMatchObject({ endsAt: END, extended: false });
  });
  it('120 s before the end: not extended', async () => {
    const { r } = await bidSecondsBeforeEnd(120);
    expect(r.auction).toMatchObject({ endsAt: END, extended: false });
  });
  it('119 s before the end: extended to bid time + 120 s', async () => {
    const { r, f } = await bidSecondsBeforeEnd(119);
    expect(r.auction.extended).toBe(true);
    expect(r.auction.endsAt).toEqual(new Date(END.getTime() + 1000));
    expect((await f.reload()).endsAt).toEqual(new Date(END.getTime() + 1000));
  });

  it('extends repeatedly and the clock closes at the extended end', async () => {
    const f = await liveAuction(h, ascendingInput());
    const [a, b] = f.bidders.map((x) => x.actor) as [Actor, Actor];
    h.clock.set(new Date(END.getTime() - 10_000));
    await bid(a, f.auction.id, 10_000_000n); // ends END+110s
    h.clock.set(new Date(END.getTime() + 100_000));
    const r = await bid(b, f.auction.id, 10_100_000n); // ends END+220s
    expect(r.auction.endsAt).toEqual(new Date(END.getTime() + 220_000));

    h.clock.set(new Date(END.getTime() + 219_999));
    expect((await tick(f)).actions).toEqual([]);
    h.clock.set(new Date(END.getTime() + 220_000));
    expect(await tick(f)).toMatchObject({ actions: ['main_phase_closed'], status: 'ENDED' });
    const auction = await f.reload();
    expect(auction.winnerBidderId).toBe(f.bidders[1]!.registration.bidderId);
  });
});

describe('ascending: outcome', () => {
  it('no bids -> UNSUCCESSFUL', async () => {
    const f = await liveAuction(h, ascendingInput());
    h.clock.set(END);
    expect(await tick(f)).toMatchObject({ status: 'UNSUCCESSFUL' });
    expect((await f.reload()).winnerBidderId).toBeNull();
  });

  it('a trustee stop ends it immediately; no bids or clock transitions after', async () => {
    const f = await liveAuction(h, ascendingInput());
    h.clock.set(at(10));
    await bid(f.bidders[0]!.actor, f.auction.id, 10_000_000n);
    await auctionService.stopAuction(h.ctx, f.trustee, f.auction.id, 'Ustavljeno zaradi napake.');
    const after = await domainError(bid(f.bidders[1]!.actor, f.auction.id, 10_100_000n));
    expect(after.code).toBe('CONFLICT');
    h.clock.set(END);
    expect(await tick(f)).toMatchObject({ actions: [], status: 'CANCELLED' });
  });
});

describe('ascending: concurrency against real Postgres', () => {
  const N = 50;

  it(`${String(N)} concurrent bids: gapless seq, strictly increasing amounts, valid chain`, async () => {
    const f = await liveAuction(h, ascendingInput(), { bidders: N });
    h.clock.set(at(60));
    const pool = createDb(inject('databaseUrl'), { max: 25 });
    try {
      const ctx: BiddingContext = {
        uow: createUnitOfWork(pool.db),
        clock: h.clock,
        appUrl: h.ctx.appUrl,
      };
      // Bidder i offers start + i*increment, all at once, in random order.
      const order = [...f.bidders.keys()].sort(() => Math.random() - 0.5);
      const results = await Promise.allSettled(
        order.map((i) =>
          placeBid(ctx, f.bidders[i]!.actor, f.auction.id, {
            amountCents: 10_000_000n + BigInt(i) * 100_000n,
            idempotencyKey: key(),
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(ok.length + failed.length).toBe(N);
      for (const r of failed) {
        expect(r.reason).toBeInstanceOf(DomainError);
        expect((r.reason as DomainError).code).toBe('VALIDATION'); // too low at its turn
      }

      const bids = await h.ctx.uow.repos.bids.listByAuction(f.auction.id);
      expect(bids).toHaveLength(ok.length);
      expect(bids.map((b) => b.seq)).toEqual(bids.map((_, i) => i + 1));
      for (let i = 1; i < bids.length; i++) {
        expect(bids[i]!.amountCents - bids[i - 1]!.amountCents >= 100_000n).toBe(true);
      }
      // The highest offer is valid whenever it arrives, so it always wins.
      const top = 10_000_000n + BigInt(N - 1) * 100_000n;
      expect(bids.at(-1)!.amountCents).toBe(top);
      const auction = await f.reload();
      expect(auction.currentPriceCents).toBe(top);
      expect(auction.leadingRegistrationId).toBe(f.bidders[N - 1]!.registration.id);
      expect(await verifyAuction(h.ctx, f.auction.id)).toMatchObject({
        valid: true,
        bidCount: bids.length,
      });
    } finally {
      await pool.close();
    }
  });

  it(`${String(N)} bidders racing at the minimum with retries: no lost updates`, async () => {
    const f = await liveAuction(h, ascendingInput(), { bidders: N });
    h.clock.set(at(60));
    const pool = createDb(inject('databaseUrl'), { max: 25 });
    try {
      const ctx: BiddingContext = {
        uow: createUnitOfWork(pool.db),
        clock: h.clock,
        appUrl: h.ctx.appUrl,
      };
      const attempts = await Promise.all(
        f.bidders.map(async ({ actor }) => {
          for (let attempt = 1; attempt <= 500; attempt++) {
            const state = await getLiveState(ctx, f.auction.id, actor);
            if (state.viewer?.isLeading) return attempt; // our bid holds the lead right now
            try {
              await placeBid(ctx, actor, f.auction.id, {
                amountCents: state.minimumBidCents!,
                idempotencyKey: key(),
              });
              return attempt;
            } catch (e) {
              if (!(e instanceof DomainError)) throw e;
            }
          }
          throw new Error('bidder never got a bid in');
        }),
      );
      expect(attempts).toHaveLength(N);

      const bids = await h.ctx.uow.repos.bids.listByAuction(f.auction.id);
      // Every bid is exactly one increment above the previous one: none was lost or overwritten.
      expect(bids.length).toBeGreaterThanOrEqual(N);
      bids.forEach((b, i) => {
        expect(b.seq).toBe(i + 1);
        expect(b.amountCents).toBe(10_000_000n + BigInt(i) * 100_000n);
      });
      expect(new Set(bids.map((b) => b.registrationId)).size).toBe(N);
      const auction = await f.reload();
      expect(auction.currentPriceCents).toBe(bids.at(-1)!.amountCents);
      expect((await verifyAuction(h.ctx, f.auction.id))?.valid).toBe(true);
    } finally {
      await pool.close();
    }
  }, 120_000);
});

describe('descending', () => {
  // 100 000 € -> -5 000 € every 60 s -> floor 70 000 €: 7 levels, ends at +420 s.
  it('the worker executes price drops on server time', async () => {
    const f = await liveAuction(h, descendingInput());
    expect(f.auction).toMatchObject({
      status: 'LIVE',
      currentPriceCents: 10_000_000n,
      currentStep: 0,
    });
    h.clock.set(at(59));
    expect((await tick(f)).actions).toEqual([]);
    h.clock.set(at(60));
    expect((await tick(f)).actions).toEqual(['price_step']);
    expect(await f.reload()).toMatchObject({ currentPriceCents: 9_500_000n, currentStep: 1 });

    const state = await getLiveState(h.ctx, f.auction.id, null);
    expect(state).toMatchObject({ mode: 'DESCENDING', nextStepAt: at(120) });
    expect(state.nextPriceCents).toBe(9_000_000n);
  });

  it('accepting ends the main phase: first acceptance wins', async () => {
    const f = await liveAuction(h, descendingInput());
    const [a] = f.bidders.map((x) => x.actor) as [Actor];
    h.clock.set(at(130));
    await tick(f);
    const stale = await domainError(accept(a, f.auction.id, 9_500_000n));
    expect(stale.message).toMatch(/spremenila/);
    const r = await accept(a, f.auction.id, 9_000_000n);
    expect(r.bid).toMatchObject({ kind: 'ACCEPT', seq: 1 });
    expect(r.auction.status).toBe('ENDED');
    expect((await f.reload()).winnerBidderId).toBe(f.bidders[0]!.registration.bidderId);
    expect((await domainError(bid(a, f.auction.id, 9_100_000n))).code).toBe('CONFLICT');
  });

  it('accept applies a due price drop the worker has not executed yet', async () => {
    const f = await liveAuction(h, descendingInput());
    h.clock.set(at(185)); // worker is "late": stored price is still the starting price
    const r = await accept(f.bidders[0]!.actor, f.auction.id, 8_500_000n);
    expect(r.bid.amountCents).toBe(8_500_000n);
  });

  it('race: two bidders accept the same price at once -> exactly one wins', async () => {
    const f = await liveAuction(h, descendingInput());
    h.clock.set(at(60));
    await tick(f);
    const pool = createDb(inject('databaseUrl'), { max: 4 });
    try {
      const ctx2: BiddingContext = {
        uow: createUnitOfWork(pool.db),
        clock: h.clock,
        appUrl: h.ctx.appUrl,
      };
      const results = await Promise.allSettled([
        accept(f.bidders[0]!.actor, f.auction.id, 9_500_000n),
        accept(f.bidders[1]!.actor, f.auction.id, 9_500_000n, ctx2),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect((failed[0]!.reason as DomainError).code).toBe('CONFLICT');
      expect((failed[0]!.reason as DomainError).message).toBe('Ceno je že sprejel drug dražitelj.');

      const bids = await h.ctx.uow.repos.bids.listByAuction(f.auction.id);
      expect(bids).toHaveLength(1);
      const auction = await f.reload();
      expect(auction.status).toBe('ENDED');
      expect(auction.leadingRegistrationId).toBe(bids[0]!.registrationId);
    } finally {
      await pool.close();
    }
  });

  it('floor reached and last step expired without acceptance -> UNSUCCESSFUL', async () => {
    const f = await liveAuction(h, descendingInput());
    for (let s = 60; s < 420; s += 60) {
      h.clock.set(at(s));
      await tick(f);
    }
    expect(await f.reload()).toMatchObject({
      status: 'LIVE',
      currentPriceCents: 7_000_000n,
      currentStep: 6,
    });
    const floorState = await getLiveState(h.ctx, f.auction.id, null);
    expect(floorState.nextPriceCents).toBeNull();
    expect(floorState.nextStepAt).toEqual(at(420));

    h.clock.set(at(420));
    const late = await domainError(accept(f.bidders[0]!.actor, f.auction.id, 7_000_000n));
    expect(late.message).toMatch(/končala/);
    expect(await tick(f)).toMatchObject({ actions: ['unsuccessful'], status: 'UNSUCCESSFUL' });
    expect(await h.ctx.uow.repos.bids.listByAuction(f.auction.id)).toHaveLength(0);
  });

  it('the trustee may stop it', async () => {
    const f = await liveAuction(h, descendingInput());
    await auctionService.stopAuction(
      h.ctx,
      f.trustee,
      f.auction.id,
      'Ustavljeno na zahtevo sodišča.',
    );
    expect((await domainError(accept(f.bidders[0]!.actor, f.auction.id, 10_000_000n))).code).toBe(
      'CONFLICT',
    );
    const audit = await h.ctx.uow.repos.auditLog.listForEntity('auction', f.auction.id);
    expect(audit.slice(-2).map((e) => e.action)).toEqual(['auction.stopped', 'auction.settled']);
  });
});

describe('descending with switch to ascending on accept', () => {
  const input = () =>
    descendingInput({ switchToAscendingOnAccept: true, bidIncrementCents: 100_000n });

  it('continues as ascending from the accepted price, with anti-sniping', async () => {
    const f = await liveAuction(h, input(), { bidders: 3 });
    const [a, b, c] = f.bidders.map((x) => x.actor) as [Actor, Actor, Actor];
    h.clock.set(at(70));
    const r = await accept(a, f.auction.id, 9_500_000n);
    expect(r.auction).toMatchObject({ status: 'LIVE', endsAt: at(190) });

    const again = await domainError(accept(b, f.auction.id, 9_500_000n));
    expect(again.message).toMatch(/nadaljuje z zviševanjem/);
    expect((await getLiveState(h.ctx, f.auction.id, b)).mode).toBe('ASCENDING');

    // The descending clock no longer drops the price.
    h.clock.set(at(125));
    expect((await tick(f)).actions).toEqual([]);
    expect((await domainError(bid(b, f.auction.id, 9_599_999n))).code).toBe('VALIDATION');
    const outbid = await bid(b, f.auction.id, 9_600_000n);
    expect(outbid.auction).toMatchObject({ extended: true, endsAt: at(245) });
    await bid(c, f.auction.id, 9_800_000n);

    h.clock.set(at(10_000));
    expect(await tick(f)).toMatchObject({ status: 'ENDED' });
    const auction = await f.reload();
    expect(auction.currentPriceCents).toBe(9_800_000n);
    expect(auction.winnerBidderId).toBe(f.bidders[2]!.registration.bidderId);
    expect(await verifyAuction(h.ctx, f.auction.id)).toMatchObject({ valid: true, bidCount: 3 });
  });

  it('the accepter wins if nobody outbids them', async () => {
    const f = await liveAuction(h, input());
    h.clock.set(at(10));
    await accept(f.bidders[0]!.actor, f.auction.id, 10_000_000n); // continuation ends at +130 s
    h.clock.set(at(129));
    expect(await tick(f)).toMatchObject({ status: 'LIVE' });
    h.clock.set(at(130));
    expect(await tick(f)).toMatchObject({ status: 'ENDED' });
    expect((await f.reload()).winnerBidderId).toBe(f.bidders[0]!.registration.bidderId);
  });
});

describe('pre-emption phase', () => {
  const input = () => ascendingInput({ preemptionEnabled: true, preemptionWindowSec: 600 });

  it('a holder matches the highest bid and becomes the winner', async () => {
    // bidder 0: ordinary, bidder 1: pre-emption holder rank 1
    const f = await liveAuction(h, input(), { preemption: { 1: 1 } });
    const [a, holder] = f.bidders.map((x) => x.actor) as [Actor, Actor];
    h.clock.set(at(60));
    await bid(a, f.auction.id, 12_000_000n);

    expect((await domainError(match(holder, f.auction.id, 12_000_000n))).code).toBe('CONFLICT');
    h.clock.set(END);
    expect(await tick(f)).toMatchObject({ status: 'PREEMPTION' });
    expect((await f.reload()).preemptionEndsAt).toEqual(new Date(END.getTime() + 600_000));

    // Only matching — never exceeding — is allowed; ordinary bids are closed.
    expect((await domainError(match(holder, f.auction.id, 12_100_000n))).code).toBe('CONFLICT');
    expect((await domainError(bid(holder, f.auction.id, 12_100_000n))).code).toBe('CONFLICT');
    expect((await domainError(match(a, f.auction.id, 12_000_000n))).code).toBe('FORBIDDEN');
    expect((await getLiveState(h.ctx, f.auction.id, holder)).viewer?.canMatch).toBe(true);

    h.clock.set(new Date(END.getTime() + 30_000));
    const r = await match(holder, f.auction.id, 12_000_000n);
    expect(r.bid).toMatchObject({ kind: 'PREEMPTION_MATCH', amountCents: 12_000_000n });
    expect(r.auction.status).toBe('ENDED'); // nobody ranked better is left
    const auction = await f.reload();
    expect(auction.winnerBidderId).toBe(f.bidders[1]!.registration.bidderId);
    expect(auction.currentPriceCents).toBe(12_000_000n);
    expect((await verifyAuction(h.ctx, f.auction.id))?.valid).toBe(true);
  });

  it('without a match the highest bidder wins when the window closes', async () => {
    const f = await liveAuction(h, input(), { preemption: { 1: 1 } });
    h.clock.set(at(60));
    await bid(f.bidders[0]!.actor, f.auction.id, 10_000_000n);
    h.clock.set(END);
    await tick(f);
    h.clock.set(new Date(END.getTime() + 599_999));
    expect((await tick(f)).actions).toEqual([]);
    h.clock.set(new Date(END.getTime() + 600_000));
    expect(await tick(f)).toMatchObject({ status: 'ENDED' });
    expect((await f.reload()).winnerBidderId).toBe(f.bidders[0]!.registration.bidderId);
  });

  it('a better-ranked holder takes precedence over one who matched first', async () => {
    const f = await liveAuction(h, input(), { bidders: 3, preemption: { 1: 2, 2: 1 } });
    const [a, rank2, rank1] = f.bidders.map((x) => x.actor) as [Actor, Actor, Actor];
    h.clock.set(at(60));
    await bid(a, f.auction.id, 10_000_000n);
    h.clock.set(END);
    await tick(f);

    const first = await match(rank2, f.auction.id, 10_000_000n);
    expect(first.auction.status).toBe('PREEMPTION'); // rank 1 may still match
    const second = await match(rank1, f.auction.id, 10_000_000n);
    expect(second.auction.status).toBe('ENDED');
    expect((await f.reload()).winnerBidderId).toBe(f.bidders[2]!.registration.bidderId);
  });

  it('skips the phase when the highest bidder is the top-ranked holder', async () => {
    const f = await liveAuction(h, input(), { preemption: { 0: 1 } });
    h.clock.set(at(60));
    await bid(f.bidders[0]!.actor, f.auction.id, 10_000_000n);
    h.clock.set(END);
    expect(await tick(f)).toMatchObject({ status: 'ENDED' });
  });
});

describe('live state', () => {
  it('shows pseudonyms only and tells the viewer whether they lead', async () => {
    const f = await liveAuction(h, ascendingInput());
    const [a, b] = f.bidders.map((x) => x.actor) as [Actor, Actor];
    h.clock.set(at(60));
    await bid(a, f.auction.id, 10_000_000n);

    const forA = await getLiveState(h.ctx, f.auction.id, a);
    expect(forA).toMatchObject({
      status: 'LIVE',
      mode: 'ASCENDING',
      leaderPseudonym: 'Dražitelj 1',
      bidCount: 1,
      viewer: { pseudonym: 'Dražitelj 1', isLeading: true, approved: true },
    });
    expect(forA.minimumBidCents).toBe(10_100_000n);
    expect(forA.bids[0]).toEqual({
      seq: 1,
      pseudonym: 'Dražitelj 1',
      amountCents: 10_000_000n,
      kind: 'BID',
      serverTime: at(60),
    });
    expect((await getLiveState(h.ctx, f.auction.id, b)).viewer?.isLeading).toBe(false);
    expect((await getLiveState(h.ctx, f.auction.id, null)).viewer).toBeNull();
    expect(
      JSON.stringify(forA, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
    ).not.toMatch(/Test|@test\.local/);
  });

  it('is available before the start, but not for drafts or unknown ids', async () => {
    const f = await liveAuction(h, ascendingInput(), { bidders: 0, start: false });
    expect((await getLiveState(h.ctx, f.auction.id, null)).status).toBe('PUBLISHED');

    const c = await caseService.createCase(h.ctx, f.trustee, caseInput());
    const lot = await lotService.createLot(h.ctx, f.trustee, c.id, lotInput());
    const draft = await auctionService.createAuction(h.ctx, f.trustee, lot.id, ascendingInput());
    expect((await domainError(getLiveState(h.ctx, draft.id, null))).code).toBe('NOT_FOUND');
    expect((await domainError(getLiveState(h.ctx, randomUUID(), null))).code).toBe('NOT_FOUND');
  });
});

describe('hash chain verification', () => {
  it('verifyAuction recomputes the stored chain', async () => {
    const f = await liveAuction(h, ascendingInput());
    h.clock.set(at(60));
    await bid(f.bidders[0]!.actor, f.auction.id, 10_000_000n);
    await bid(f.bidders[1]!.actor, f.auction.id, 10_500_000n);
    const v = await verifyAuction(h.ctx, f.auction.id);
    expect(v).toMatchObject({ valid: true, bidCount: 2, priceConsistent: true, problems: [] });
    const last = (await h.ctx.uow.repos.bids.findLast(f.auction.id))!;
    expect(v?.headHash).toBe(last.hash);
    expect(await verifyAuction(h.ctx, randomUUID())).toBeNull();
  });
});

describe('trustee outcome view', () => {
  it('shows the winner and the bid log with real identities to the owning trustee only', async () => {
    const f = await liveAuction(h, ascendingInput());
    h.clock.set(at(60));
    await bid(f.bidders[0]!.actor, f.auction.id, 10_000_000n);
    await bid(f.bidders[1]!.actor, f.auction.id, 10_500_000n);

    const live = await getAuctionOutcome(h.ctx, f.trustee, f.auction.id);
    expect(live).toMatchObject({
      status: 'LIVE',
      priceCents: 10_500_000n,
      leader: { pseudonym: 'Dražitelj 2', name: 'Dražitelj Test 2' },
      verification: { valid: true, bidCount: 2 },
    });
    expect(live.bids.map((b) => [b.seq, b.pseudonym, b.name])).toEqual([
      [1, 'Dražitelj 1', 'Dražitelj Test 1'],
      [2, 'Dražitelj 2', 'Dražitelj Test 2'],
    ]);

    h.clock.set(END);
    await tick(f);
    expect(await getAuctionOutcome(h.ctx, f.trustee, f.auction.id)).toMatchObject({
      status: 'ENDED',
      leader: { name: 'Dražitelj Test 2' },
      closedAt: END,
    });

    const otherTrustee = await h.trustee();
    expect((await domainError(getAuctionOutcome(h.ctx, otherTrustee, f.auction.id))).code).toBe(
      'NOT_FOUND',
    );
    expect(
      (await domainError(getAuctionOutcome(h.ctx, f.bidders[0]!.actor, f.auction.id))).code,
    ).toBe('FORBIDDEN');
  });
});
