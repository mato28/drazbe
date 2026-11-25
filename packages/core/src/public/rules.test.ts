import { describe, expect, it } from 'vitest';
import { type AuctionConfig } from '../auctions/config';
import { auctionRulesSummary } from './rules';

const ascending: AuctionConfig = {
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
};
const descending: AuctionConfig = {
  ...ascending,
  type: 'DESCENDING',
  bidIncrementCents: null,
  priceDecrementCents: 500_000n,
  floorPriceCents: 7_000_000n,
  stepDurationSec: 60,
  endsAt: null,
};

describe('auctionRulesSummary', () => {
  it('describes an ascending auction with its actual numbers', () => {
    const text = auctionRulesSummary(ascending).join('\n');
    expect(text).toContain('z zviševanjem izklicne cene');
    expect(text).toContain('najmanj 100.000,00 €');
    expect(text).toContain('korak draženja 1.000,00 €');
    expect(text).toContain('v zadnjih 2 min pred iztekom, se dražba podaljša za 2 min');
    expect(text).toContain('varščino 10.000,00 €');
    expect(text).not.toContain('predkupna pravica');
  });

  it('omits anti-sniping when it is disabled', () => {
    const text = auctionRulesSummary({ ...ascending, extensionWindowSec: 0 }).join('\n');
    expect(text).not.toContain('podaljša');
  });

  it('describes a descending auction', () => {
    const text = auctionRulesSummary(descending).join('\n');
    expect(text).toContain('z zniževanjem izklicne cene');
    expect(text).toContain('vsakih 1 min zniža za 5.000,00 €, vendar ne pod 70.000,00 €');
    expect(text).toContain('S sprejemom cene je dražba končana');
    expect(text).not.toContain('korak draženja');
  });

  it('describes the mixed mode and pre-emption', () => {
    const text = auctionRulesSummary({
      ...descending,
      switchToAscendingOnAccept: true,
      bidIncrementCents: 50_000n,
      preemptionEnabled: true,
    }).join('\n');
    expect(text).toContain('se dražba nadaljuje z zviševanjem');
    expect(text).toContain('korak draženja 500,00 €');
    expect(text).toContain('Predkupni upravičenec lahko v 10 min');
  });
});
