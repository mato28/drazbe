import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['041 123 456', '+38641123456'],
    ['041/123-456', '+38641123456'],
    ['(01) 234 56 78', '+38612345678'],
    ['+386 41 123 456', '+38641123456'],
    ['00386 41 123 456', '+38641123456'],
    ['+43 660 1234567', '+436601234567'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '12345', 'abc', '041 123', '+0 123 456 789'])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
