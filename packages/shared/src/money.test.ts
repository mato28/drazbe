import { describe, expect, it } from 'vitest';
import { centsToInput, formatCents, parseEuroInput } from './money';

describe('formatCents', () => {
  it.each([
    [0n, '0,00 €'],
    [5n, '0,05 €'],
    [18_500_000n, '185.000,00 €'],
    [123_456_789n, '1.234.567,89 €'],
    ['100', '1,00 €'],
  ] as const)('%s -> %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it('centsToInput omits the currency sign', () => {
    expect(centsToInput(18_500_050n)).toBe('185.000,50');
  });
});

describe('parseEuroInput', () => {
  it.each([
    ['185000', 18_500_000n],
    ['185.000', 18_500_000n],
    ['185.000,00', 18_500_000n],
    ['185 000,5 €', 18_500_050n],
    ['1.234.567,89', 123_456_789n],
    ['185000.50', 18_500_050n],
    ['0,01', 1n],
    ['12,3', 1_230n],
  ] as const)('%s -> %s', (input, expected) => {
    expect(parseEuroInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1,234', '1,2,3', '12.34.56', '1.23,00', '1e5'])(
    'rejects %j',
    (input) => {
      expect(parseEuroInput(input)).toBeNull();
    },
  );

  it('round-trips with centsToInput', () => {
    for (const c of [0n, 1n, 99n, 100n, 18_500_050n, 99_999_999_999n]) {
      expect(parseEuroInput(centsToInput(c))).toBe(c);
    }
  });
});
