import { describe, expect, it } from 'vitest';
import { publicAuctionQuerySchema } from './public';

describe('publicAuctionQuerySchema', () => {
  it('parses valid filters', () => {
    expect(
      publicAuctionQuerySchema.parse({
        vrsta: 'APARTMENT',
        kraj: ' Ljubljana ',
        nacin: 'DESCENDING',
        stanje: 'LIVE',
        cenaOd: '50000',
        cenaDo: '200000',
        stran: '3',
      }),
    ).toEqual({
      vrsta: 'APARTMENT',
      kraj: 'Ljubljana',
      nacin: 'DESCENDING',
      stanje: 'LIVE',
      cenaOd: 5_000_000n,
      cenaDo: 20_000_000n,
      stran: 3,
    });
  });

  it('ignores malformed values instead of failing', () => {
    expect(
      publicAuctionQuerySchema.parse({
        vrsta: 'CASTLE',
        nacin: ['ASCENDING', 'DESCENDING'],
        stanje: 'DRAFT',
        cenaOd: '-5',
        cenaDo: '1e9',
        stran: 'abc',
      }),
    ).toEqual({ stran: 1 });
  });

  it('never lets DRAFT (or finished phases) through the status filter', () => {
    for (const stanje of ['DRAFT', 'ENDED', 'CANCELLED', 'PUBLISHED']) {
      expect(publicAuctionQuerySchema.parse({ stanje }).stanje).toBeUndefined();
    }
  });
});
