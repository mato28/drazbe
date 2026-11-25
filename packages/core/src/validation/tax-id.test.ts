import { describe, expect, it } from 'vitest';
import { isValidSlovenianTaxId, normalizeTaxId } from './tax-id';

describe('Slovenian tax id', () => {
  it('normalizes the SI prefix and spaces', () => {
    expect(normalizeTaxId('SI 1234 5679')).toBe('12345679');
    expect(normalizeTaxId('si12345679')).toBe('12345679');
  });

  it.each(['12345679', '87654326', '11111119', '98765434'])('accepts %s', (id) => {
    expect(isValidSlovenianTaxId(id)).toBe(true);
  });

  it.each(['12345678', '1234567', '123456790', '02345679', 'abcdefgh', ''])('rejects %j', (id) => {
    expect(isValidSlovenianTaxId(id)).toBe(false);
  });
});
