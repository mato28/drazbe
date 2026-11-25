import { describe, expect, it } from 'vitest';
import {
  type AuctionConfig,
  defaultDepositCents,
  defaultRegistrationDeadline,
  descendingSchedule,
  normalizeAuctionConfig,
  validateAuctionConfig,
} from './config';

const NOW = new Date('2030-01-02T08:00:00Z');

const ascending = (over: Partial<AuctionConfig> = {}): AuctionConfig => ({
  type: 'ASCENDING',
  startingPriceCents: 10_000_000n,
  bidIncrementCents: 100_000n,
  priceDecrementCents: null,
  floorPriceCents: null,
  stepDurationSec: null,
  switchToAscendingOnAccept: false,
  startsAt: new Date('2030-01-10T09:00:00Z'),
  endsAt: new Date('2030-01-10T10:00:00Z'),
  extensionWindowSec: 120,
  extensionSec: 120,
  registrationDeadline: new Date('2030-01-08T09:00:00Z'),
  depositCents: 1_000_000n,
  preemptionEnabled: false,
  preemptionWindowSec: 600,
  courtApprovalRef: null,
  ...over,
});

const descending = (over: Partial<AuctionConfig> = {}): AuctionConfig =>
  ascending({
    type: 'DESCENDING',
    bidIncrementCents: null,
    priceDecrementCents: 500_000n,
    floorPriceCents: 7_000_000n,
    stepDurationSec: 60,
    endsAt: null,
    ...over,
  });

describe('validateAuctionConfig — valid configs', () => {
  it('accepts a valid ascending auction', () => {
    expect(validateAuctionConfig(ascending(), NOW)).toEqual({});
  });

  it('accepts a valid descending auction', () => {
    expect(validateAuctionConfig(descending(), NOW)).toEqual({});
  });

  it('accepts a descending auction that switches to ascending', () => {
    expect(
      validateAuctionConfig(
        descending({ switchToAscendingOnAccept: true, bidIncrementCents: 50_000n }),
        NOW,
      ),
    ).toEqual({});
  });

  it('accepts floor equal to the starting price (single step)', () => {
    expect(validateAuctionConfig(descending({ floorPriceCents: 10_000_000n }), NOW)).toEqual({});
  });
});

describe('validateAuctionConfig — prices', () => {
  it('rejects a non-positive starting price', () => {
    expect(validateAuctionConfig(ascending({ startingPriceCents: 0n }), NOW)).toHaveProperty(
      'startingPriceCents',
      'Izklicna cena mora biti večja od 0.',
    );
  });

  it('rejects a missing or zero bid increment', () => {
    const msg = 'Korak draženja mora biti večji od 0.';
    expect(validateAuctionConfig(ascending({ bidIncrementCents: null }), NOW)).toHaveProperty(
      'bidIncrementCents',
      msg,
    );
    expect(validateAuctionConfig(ascending({ bidIncrementCents: 0n }), NOW)).toHaveProperty(
      'bidIncrementCents',
      msg,
    );
  });

  it('rejects a bid increment above the starting price', () => {
    expect(
      validateAuctionConfig(ascending({ bidIncrementCents: 10_000_001n }), NOW),
    ).toHaveProperty('bidIncrementCents', 'Korak draženja ne sme presegati izklicne cene.');
  });

  it('rejects a floor above the starting price', () => {
    expect(validateAuctionConfig(descending({ floorPriceCents: 10_000_001n }), NOW)).toHaveProperty(
      'floorPriceCents',
      'Najnižja cena ne sme presegati izklicne cene.',
    );
  });

  it('rejects a missing or zero floor', () => {
    expect(validateAuctionConfig(descending({ floorPriceCents: null }), NOW)).toHaveProperty(
      'floorPriceCents',
      'Najnižja cena mora biti večja od 0.',
    );
  });

  it('rejects a zero or missing decrement', () => {
    const msg = 'Korak zniževanja mora biti večji od 0.';
    expect(validateAuctionConfig(descending({ priceDecrementCents: 0n }), NOW)).toHaveProperty(
      'priceDecrementCents',
      msg,
    );
    expect(validateAuctionConfig(descending({ priceDecrementCents: null }), NOW)).toHaveProperty(
      'priceDecrementCents',
      msg,
    );
  });

  it('rejects a decrement larger than the price range', () => {
    expect(
      validateAuctionConfig(descending({ priceDecrementCents: 3_000_001n }), NOW),
    ).toHaveProperty(
      'priceDecrementCents',
      'Korak zniževanja ne sme biti večji od razlike med izklicno in najnižjo ceno.',
    );
  });

  it('rejects an absurd number of steps', () => {
    expect(
      validateAuctionConfig(descending({ priceDecrementCents: 1n }), NOW).priceDecrementCents,
    ).toMatch(/Preveč korakov/);
  });

  it('rejects a too-short step', () => {
    expect(validateAuctionConfig(descending({ stepDurationSec: 5 }), NOW)).toHaveProperty(
      'stepDurationSec',
      'Trajanje koraka mora biti vsaj 10 sekund.',
    );
  });

  it('requires a bid increment when switching to ascending', () => {
    expect(
      validateAuctionConfig(descending({ switchToAscendingOnAccept: true }), NOW),
    ).toHaveProperty(
      'bidIncrementCents',
      'Za nadaljevanje z zviševanjem določite korak draženja, večji od 0.',
    );
  });

  it('rejects a zero deposit and a deposit above the starting price', () => {
    expect(validateAuctionConfig(ascending({ depositCents: 0n }), NOW)).toHaveProperty(
      'depositCents',
      'Varščina mora biti večja od 0.',
    );
    expect(validateAuctionConfig(ascending({ depositCents: 10_000_001n }), NOW)).toHaveProperty(
      'depositCents',
      'Varščina ne sme presegati izklicne cene.',
    );
  });
});

describe('validateAuctionConfig — timing', () => {
  it('rejects a start in the past', () => {
    expect(validateAuctionConfig(ascending(), new Date('2030-01-10T09:00:00Z'))).toHaveProperty(
      'startsAt',
      'Začetek dražbe mora biti v prihodnosti.',
    );
  });

  it('rejects a registration deadline at or after the start', () => {
    const msg = 'Rok za prijavo mora biti pred začetkom dražbe.';
    expect(
      validateAuctionConfig(
        ascending({ registrationDeadline: new Date('2030-01-10T09:00:00Z') }),
        NOW,
      ),
    ).toHaveProperty('registrationDeadline', msg);
    expect(
      validateAuctionConfig(
        ascending({ registrationDeadline: new Date('2030-01-11T09:00:00Z') }),
        NOW,
      ),
    ).toHaveProperty('registrationDeadline', msg);
  });

  it('rejects a registration deadline that has already passed', () => {
    expect(validateAuctionConfig(ascending(), new Date('2030-01-09T00:00:00Z'))).toHaveProperty(
      'registrationDeadline',
      'Rok za prijavo mora biti v prihodnosti.',
    );
  });

  it('rejects a missing end, an end before the start, and a too-short auction', () => {
    expect(validateAuctionConfig(ascending({ endsAt: null }), NOW)).toHaveProperty(
      'endsAt',
      'Določite konec dražbe.',
    );
    expect(
      validateAuctionConfig(ascending({ endsAt: new Date('2030-01-10T08:59:00Z') }), NOW),
    ).toHaveProperty('endsAt', 'Konec dražbe mora biti po začetku dražbe.');
    expect(
      validateAuctionConfig(ascending({ endsAt: new Date('2030-01-10T09:04:00Z') }), NOW),
    ).toHaveProperty('endsAt', 'Dražba mora trajati vsaj 5 minut.');
  });

  it('does not require an end for descending auctions', () => {
    expect(validateAuctionConfig(descending({ endsAt: null }), NOW)).not.toHaveProperty('endsAt');
  });

  it('rejects an anti-sniping window without an extension', () => {
    expect(validateAuctionConfig(ascending({ extensionSec: 0 }), NOW)).toHaveProperty(
      'extensionSec',
      'Podaljšanje mora biti daljše od 0 sekund.',
    );
    // Disabling anti-sniping entirely is allowed.
    expect(
      validateAuctionConfig(ascending({ extensionWindowSec: 0, extensionSec: 0 }), NOW),
    ).toEqual({});
  });

  it('rejects a too-short pre-emption window only when pre-emption is enabled', () => {
    expect(
      validateAuctionConfig(ascending({ preemptionEnabled: true, preemptionWindowSec: 30 }), NOW),
    ).toHaveProperty('preemptionWindowSec');
    expect(
      validateAuctionConfig(ascending({ preemptionEnabled: false, preemptionWindowSec: 30 }), NOW),
    ).toEqual({});
  });

  it('reports several problems at once', () => {
    const errors = validateAuctionConfig(
      descending({ floorPriceCents: 20_000_000n, priceDecrementCents: 0n, depositCents: 0n }),
      NOW,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'depositCents',
      'floorPriceCents',
      'priceDecrementCents',
    ]);
  });
});

describe('descendingSchedule', () => {
  it('counts price levels and computes the end', () => {
    // 100k -> 95k -> 90k -> 85k -> 80k -> 75k -> 70k: 7 levels x 60 s
    const s = descendingSchedule(descending());
    expect(s?.steps).toBe(7);
    expect(s?.endsAt.toISOString()).toBe('2030-01-10T09:07:00.000Z');
  });

  it('handles a decrement that does not divide the range evenly', () => {
    // 100k -> 96k -> 92k -> 88k -> 84k -> 80k -> 76k -> 72k -> 70k (floor): 9 levels
    expect(descendingSchedule(descending({ priceDecrementCents: 400_000n }))?.steps).toBe(9);
  });

  it('is null for ascending or incomplete configs', () => {
    expect(descendingSchedule(ascending())).toBeNull();
    expect(descendingSchedule(descending({ floorPriceCents: null }))).toBeNull();
  });
});

describe('defaults and normalization', () => {
  it('defaults the deposit to 10 % and the deadline to 2 working days before', () => {
    expect(defaultDepositCents(18_500_000n)).toBe(1_850_000n);
    expect(defaultDepositCents(999n)).toBe(99n);
    expect(defaultRegistrationDeadline(new Date('2030-01-14T09:00:00Z')).toISOString()).toBe(
      '2030-01-10T09:00:00.000Z',
    );
  });

  it('clears descending-only fields on ascending auctions', () => {
    const n = normalizeAuctionConfig(
      ascending({
        priceDecrementCents: 1n,
        floorPriceCents: 1n,
        stepDurationSec: 5,
        switchToAscendingOnAccept: true,
      }),
    );
    expect(n).toMatchObject({
      priceDecrementCents: null,
      floorPriceCents: null,
      stepDurationSec: null,
      switchToAscendingOnAccept: false,
    });
  });

  it('clears the end and (unless switching) the bid increment on descending auctions', () => {
    const base = descending({ endsAt: new Date('2030-01-10T10:00:00Z'), bidIncrementCents: 5n });
    expect(normalizeAuctionConfig(base)).toMatchObject({ endsAt: null, bidIncrementCents: null });
    expect(
      normalizeAuctionConfig({ ...base, switchToAscendingOnAccept: true }).bidIncrementCents,
    ).toBe(5n);
  });
});
