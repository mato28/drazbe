import { describe, expect, it } from 'vitest';
import { formatIban, isValidIban, normalizeIban } from './iban';

describe('IBAN', () => {
  it('normalizes spacing and case', () => {
    expect(normalizeIban(' si56 0510 0801 2340 041 ')).toBe('SI56051008012340041');
  });

  it.each([
    'SI56051008012340041',
    'SI56263300012039086',
    'DE89370400440532013000',
    'AT611904300234573201',
  ])('accepts %s', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });

  it.each([
    ['SI56051008012340042', 'wrong check digits'],
    ['SI5605100801234004', 'too short for SI'],
    ['SI560510080123400411', 'too long for SI'],
    ['5605100801234004111', 'no country'],
    ['SI56 0510 0801 2340 041', 'not normalized'],
    ['', 'empty'],
  ])('rejects %s (%s)', (iban) => {
    expect(isValidIban(iban)).toBe(false);
  });

  it('formats in groups of four', () => {
    expect(formatIban('SI56051008012340041')).toBe('SI56 0510 0801 2340 041');
  });
});
