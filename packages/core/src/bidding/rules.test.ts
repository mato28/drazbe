import type { AuctionRow } from '@domik/db';
import { describe, expect, it } from 'vitest';
import {
  bidAmountError,
  continuationEndsAt,
  descendingStepAt,
  eligiblePreemptionHolders,
  extendedEndsAt,
  isAscendingMode,
  minimumBid,
} from './rules';

const START = new Date('2030-01-10T09:00:00Z');
const at = (sec: number): Date => new Date(START.getTime() + sec * 1000);

describe('ascending bid amount', () => {
  const base = { startingPriceCents: 10_000_000n, bidIncrementCents: 100_000n };

  it('first bid must be at least the starting price', () => {
    const a = { ...base, currentPriceCents: null };
    expect(minimumBid(a)).toBe(10_000_000n);
    expect(bidAmountError(a, 9_999_999n)).toMatch(/izklicni ceni/);
    expect(bidAmountError(a, 10_000_000n)).toBeNull();
  });

  it('later bids must be at least current price + increment', () => {
    const a = { ...base, currentPriceCents: 10_500_000n };
    expect(minimumBid(a)).toBe(10_600_000n);
    expect(bidAmountError(a, 10_599_999n)).toMatch(/korak/);
    expect(bidAmountError(a, 10_600_000n)).toBeNull();
    expect(bidAmountError(a, 99_000_000n)).toBeNull();
  });
});

describe('anti-sniping extension (window 120 s, extension 120 s)', () => {
  const endsAt = at(3600);
  const bidAt = (secondsBeforeEnd: number) => at(3600 - secondsBeforeEnd);

  it('121 s before the end: no extension', () => {
    expect(extendedEndsAt(endsAt, bidAt(121), 120, 120)).toEqual(endsAt);
  });
  it('exactly 120 s before the end: no extension (rule is "< window")', () => {
    expect(extendedEndsAt(endsAt, bidAt(120), 120, 120)).toEqual(endsAt);
  });
  it('119 s before the end: ends 120 s after the bid', () => {
    expect(extendedEndsAt(endsAt, bidAt(119), 120, 120)).toEqual(at(3600 - 119 + 120));
  });
  it('1 ms before the end: extends', () => {
    const now = new Date(endsAt.getTime() - 1);
    expect(extendedEndsAt(endsAt, now, 120, 120)).toEqual(new Date(now.getTime() + 120_000));
  });
  it('never moves the end earlier (extension shorter than the window)', () => {
    expect(extendedEndsAt(endsAt, bidAt(100), 120, 30)).toEqual(endsAt);
    expect(extendedEndsAt(endsAt, bidAt(10), 120, 30)).toEqual(at(3600 - 10 + 30));
  });
  it('window 0 disables anti-sniping', () => {
    expect(extendedEndsAt(endsAt, bidAt(1), 0, 120)).toEqual(endsAt);
  });
});

const descending = (over: Partial<AuctionRow> = {}) =>
  ({
    type: 'DESCENDING',
    startingPriceCents: 10_000_000n,
    priceDecrementCents: 1_000_000n,
    floorPriceCents: 7_500_000n,
    stepDurationSec: 60,
    switchToAscendingOnAccept: false,
    startsAt: START,
    endsAt: null,
    bidIncrementCents: null,
    extensionWindowSec: 120,
    extensionSec: 120,
    registrationDeadline: at(-86_400),
    depositCents: 1_000_000n,
    preemptionEnabled: false,
    preemptionWindowSec: 600,
    courtApprovalRef: null,
    acceptedAt: null,
    ...over,
  }) as AuctionRow;

describe('descending price steps', () => {
  // 100k -> 90k -> 80k -> 75k (floor, a shorter last drop): 4 levels, ends after 240 s.
  const a = descending();

  it('starts at the starting price', () => {
    expect(descendingStepAt(a, at(0))).toMatchObject({
      step: 0,
      priceCents: 10_000_000n,
      stepEndsAt: at(60),
      nextPriceCents: 9_000_000n,
      isLast: false,
      expired: false,
    });
  });
  it('drops exactly at each step boundary', () => {
    expect(descendingStepAt(a, at(59.999)).step).toBe(0);
    expect(descendingStepAt(a, at(60)).priceCents).toBe(9_000_000n);
    expect(descendingStepAt(a, at(120)).priceCents).toBe(8_000_000n);
  });
  it('never goes below the floor', () => {
    expect(descendingStepAt(a, at(180))).toMatchObject({
      step: 3,
      priceCents: 7_500_000n,
      isLast: true,
      nextPriceCents: null,
      stepEndsAt: at(240),
      expired: false,
    });
  });
  it('expires when the floor step has run out', () => {
    expect(descendingStepAt(a, at(239.999)).expired).toBe(false);
    expect(descendingStepAt(a, at(240))).toMatchObject({ expired: true, priceCents: 7_500_000n });
  });
  it('before the start it is at the starting level', () => {
    expect(descendingStepAt(a, at(-30)).step).toBe(0);
  });
});

describe('modes', () => {
  it('descending switches to ascending mode once accepted', () => {
    expect(isAscendingMode(descending())).toBe(false);
    expect(isAscendingMode(descending({ acceptedAt: at(10) }))).toBe(true);
    expect(isAscendingMode({ type: 'ASCENDING', acceptedAt: null })).toBe(true);
  });
  it('continuation lasts the extension time, at least 60 s', () => {
    expect(continuationEndsAt({ extensionSec: 120 }, at(0))).toEqual(at(120));
    expect(continuationEndsAt({ extensionSec: 0 }, at(0))).toEqual(at(60));
  });
});

describe('eligible pre-emption holders', () => {
  const reg = (id: string, rank: number | null, over: Record<string, unknown> = {}) => ({
    id,
    isPreemptionHolder: rank !== null,
    preemptionRank: rank,
    status: 'APPROVED',
    depositStatus: 'PAID',
    ...over,
  });
  const regs = [
    reg('leader', null),
    reg('h2', 2),
    reg('h1', 1),
    reg('unpaid', 3, { depositStatus: 'PENDING' }),
    reg('pending', 4, { status: 'PENDING' }),
  ];

  it('lists approved, paid holders by rank, excluding the leader', () => {
    expect(eligiblePreemptionHolders(regs, 'leader').map((r) => r.id)).toEqual(['h1', 'h2']);
  });
  it('a leading holder can only be displaced by a better-ranked holder', () => {
    expect(eligiblePreemptionHolders(regs, 'h2').map((r) => r.id)).toEqual(['h1']);
    expect(eligiblePreemptionHolders(regs, 'h1')).toEqual([]);
  });
});
