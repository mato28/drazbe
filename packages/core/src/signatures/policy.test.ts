import { describe, expect, it } from 'vitest';
import { evaluateSignatures, nameMatches, normalizeName } from './policy';
import { type SignatureInfo } from './validator';

const NOW = new Date('2030-01-01T00:00:00Z');
const sig = (signedBy: string | null, over: Partial<SignatureInfo> = {}): SignatureInfo => ({
  signedBy,
  indication: 'TOTAL_PASSED',
  subIndication: null,
  qualification: 'QESig',
  signingTime: null,
  format: null,
  ...over,
});
const qualified = { requireQualified: true };
const dev = { requireQualified: false };

describe('signer name matching', () => {
  it('ignores diacritics, case, order and extra name parts', () => {
    expect(normalizeName('  Kovač   Đurić-Žan ')).toBe('kovac duric zan');
    expect(nameMatches('MAJA KOVAC', 'Maja Kovač')).toBe(true);
    expect(nameMatches('Kovač Maja', 'Maja Kovač')).toBe(true);
    expect(nameMatches('Maja Ana Kovač', 'Maja Kovač')).toBe(true);
    expect(nameMatches('Maja Novak', 'Maja Kovač')).toBe(false);
    expect(nameMatches('Maja', 'Maja Kovač')).toBe(false);
    expect(nameMatches(null, 'Maja Kovač')).toBe(false);
  });
});

describe('evaluateSignatures', () => {
  it('accepts a valid QES of the expected signer', () => {
    const r = evaluateSignatures(
      { signatures: [sig('MAJA KOVAC')] },
      ['Maja Kovač'],
      qualified,
      NOW,
    );
    expect(r).toMatchObject({ ok: true, problems: [] });
    expect(r.signatures[0]?.matches).toBe('Maja Kovač');
  });

  it('rejects unsigned documents, non-qualified and broken signatures', () => {
    expect(evaluateSignatures({ signatures: [] }, ['Maja Kovač'], qualified, NOW).problems).toEqual(
      ['Dokument ne vsebuje elektronskega podpisa.'],
    );
    const ades = evaluateSignatures(
      { signatures: [sig('Maja Kovač', { qualification: 'AdESig' })] },
      ['Maja Kovač'],
      qualified,
      NOW,
    );
    expect(ades.ok).toBe(false);
    expect(ades.problems[0]).toContain('ni kvalificiran');
    const broken = evaluateSignatures(
      { signatures: [sig('Maja Kovač', { indication: 'TOTAL_FAILED' })] },
      ['Maja Kovač'],
      dev,
      NOW,
    );
    expect(broken.ok).toBe(false);
  });

  it('dev policy accepts an intact signature from an untrusted (test) certificate', () => {
    const untrusted = sig('Maja Kovač', {
      indication: 'INDETERMINATE',
      subIndication: 'NO_CERTIFICATE_CHAIN_FOUND',
      qualification: 'NA',
    });
    expect(evaluateSignatures({ signatures: [untrusted] }, ['Maja Kovač'], dev, NOW).ok).toBe(true);
    expect(evaluateSignatures({ signatures: [untrusted] }, ['Maja Kovač'], qualified, NOW).ok).toBe(
      false,
    );
  });

  it('requires every expected signer', () => {
    const r = evaluateSignatures(
      { signatures: [sig('Maja Kovač'), sig('Someone Else')] },
      ['Maja Kovač', 'Test Upravitelj'],
      qualified,
      NOW,
    );
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([
      'Manjka veljaven podpis osebe Test Upravitelj (v dokumentu so podpisi: Maja Kovač, Someone Else).',
    ]);
  });
});
