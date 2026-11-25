import { describe, expect, it } from 'vitest';
import {
  buildDepositReference,
  compactReference,
  findReferenceInText,
  isValidSi00Reference,
} from './sklic';

describe('deposit sklic (SI00)', () => {
  it('builds SI00 <auction>-<registration>', () => {
    expect(buildDepositReference(1042, 7)).toBe('SI00 1042-7');
    expect(isValidSi00Reference(buildDepositReference(1042, 7))).toBe(true);
  });

  it('is unique per auction + registration', () => {
    const refs = new Set<string>();
    for (let a = 1001; a < 1021; a++)
      for (let s = 1; s <= 50; s++) refs.add(buildDepositReference(a, s));
    expect(refs.size).toBe(20 * 50);
  });

  it('rejects impossible numbers', () => {
    expect(() => buildDepositReference(0, 1)).toThrow();
    expect(() => buildDepositReference(1, 0)).toThrow();
    expect(() => buildDepositReference(1.5, 1)).toThrow();
  });

  it.each(['SI00 1042-7', 'SI001042-7', 'si00 1042-7', 'SI00 12345678901234567890', 'SI00 1-2-3'])(
    'accepts %s',
    (ref) => {
      expect(isValidSi00Reference(ref)).toBe(true);
    },
  );

  it.each([
    'SI00',
    'SI00 ',
    'SI00 1042-',
    'SI00 -7',
    'SI00 1-2-3-4', // more than two hyphens
    'SI00 123456789012345678901', // 21 digits
    'SI00 10A2-7',
    'SI12 1042-7', // other model
    '1042-7',
  ])('rejects %j', (ref) => {
    expect(isValidSi00Reference(ref)).toBe(false);
  });

  it('compacts for comparison', () => {
    expect(compactReference(' si00 1042-7 ')).toBe('SI001042-7');
    expect(compactReference('SI00 1042 - 7')).toBe('SI001042-7');
    expect(compactReference('RF18 5390 0754 7034')).toBeNull();
  });

  it('finds a reference inside free text', () => {
    expect(findReferenceInText('Varscina drazba SI00 1042-7 Novak')).toBe('SI001042-7');
    expect(findReferenceInText('placilo si001042-7')).toBe('SI001042-7');
    expect(findReferenceInText('brez sklica')).toBeNull();
  });
});
