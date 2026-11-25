import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBankStatement, parseCamt053, parseStatementCsv } from './bank-statement';
import { type DepositExpectation, matchDeposits, namesMatch } from './matching';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const expectations: DepositExpectation[] = [
  {
    registrationId: 'reg-1',
    paymentReference: 'SI00 1001-1',
    depositCents: 2_400_000n,
    payerNames: ['Janez Novak'],
  },
  {
    registrationId: 'reg-2',
    paymentReference: 'SI00 1001-2',
    depositCents: 2_400_000n,
    payerNames: ['Maja Kovač', 'Nepremičnine Kovač d.o.o.'],
  },
  {
    registrationId: 'reg-3',
    paymentReference: 'SI00 1001-3',
    depositCents: 2_400_000n,
    payerNames: ['Peter Kralj'],
  },
  {
    registrationId: 'reg-4',
    paymentReference: 'SI00 1001-4',
    depositCents: 2_400_000n,
    payerNames: ['Ana Zupan'],
  },
];

describe('parseCamt053', () => {
  const txs = parseCamt053(fixture('statement.camt053.xml'));

  it('returns only the booked incoming payments', () => {
    expect(txs).toHaveLength(4);
    expect(txs.map((t) => t.bankReference)).toEqual([
      'TRX-0001',
      'TRX-0002',
      'TRX-0003',
      'TRX-0004',
    ]);
  });

  it('reads amount, date, payer and the structured reference', () => {
    expect(txs[0]).toEqual({
      line: 1,
      bookingDate: '2026-11-25',
      amountCents: 2_400_000n,
      payerName: 'JANEZ NOVAK',
      reference: 'SI001001-1',
      description: 'Varščina za dražbo št. 1001',
      bankReference: 'TRX-0001',
    });
  });

  it('finds a reference in unstructured remittance text', () => {
    expect(txs[1]).toMatchObject({
      reference: 'SI001001-2',
      payerName: 'Nepremičnine Kovač d.o.o.',
    });
  });

  it('normalizes the spacing of the reference', () => {
    expect(txs[2]?.reference).toBe('SI001001-3');
  });

  it('keeps unrelated payments without a reference', () => {
    expect(txs[3]).toMatchObject({ reference: null, amountCents: 35_000n });
  });

  it('rejects files that are not camt.053', () => {
    expect(() => parseCamt053('<html><body>nope</body></html>')).toThrow(/camt\.053/);
    expect(() => parseCamt053('<?xml version="1.0"?><Document><Other/></Document>')).toThrow(
      /camt\.053/,
    );
  });
});

describe('camt.053 import matches deposits', () => {
  const result = matchDeposits(parseCamt053(fixture('statement.camt053.xml')), expectations);

  it('matches by sklic and grades the confidence', () => {
    expect(
      result.matches.map((m) => [m.registrationId, m.confidence, m.transaction.bankReference]),
    ).toEqual([
      ['reg-1', 'EXACT', 'TRX-0001'],
      ['reg-2', 'EXACT', 'TRX-0002'],
      ['reg-3', 'AMOUNT_MISMATCH', 'TRX-0003'],
    ]);
  });

  it('leaves unrelated payments unmatched and proposes nothing for unpaid deposits', () => {
    expect(result.unmatched.map((t) => t.bankReference)).toEqual(['TRX-0004']);
    expect(result.matches.some((m) => m.registrationId === 'reg-4')).toBe(false);
  });
});

describe('parseStatementCsv', () => {
  const txs = parseStatementCsv(fixture('statement.csv'));

  it('reads Slovenian CSV exports: semicolons, quotes, decimal comma', () => {
    expect(txs).toHaveLength(3); // the negative (outgoing) row is skipped
    expect(txs[0]).toMatchObject({
      bookingDate: '2026-11-25',
      amountCents: 2_400_000n,
      payerName: 'JANEZ NOVAK',
      reference: 'SI001001-1',
    });
    // quoted cell containing the delimiter, reference only in the purpose text
    expect(txs[1]).toMatchObject({
      payerName: 'Nepremičnine Kovač d.o.o.',
      reference: 'SI001001-2',
    });
  });

  it('gives the same matches as the camt.053 file', () => {
    const result = matchDeposits(txs, expectations);
    expect(result.matches.map((m) => [m.registrationId, m.confidence])).toEqual([
      ['reg-1', 'EXACT'],
      ['reg-2', 'EXACT'],
    ]);
  });

  it('needs an amount column', () => {
    expect(() => parseStatementCsv('Datum;Opis\n1.1.2026;x')).toThrow(/zneskom/);
    expect(() => parseStatementCsv('')).toThrow(/prazna/);
  });
});

describe('parseBankStatement', () => {
  it('detects the format', () => {
    expect(parseBankStatement(fixture('statement.camt053.xml'))).toHaveLength(4);
    expect(parseBankStatement(`\uFEFF${fixture('statement.csv')}`)).toHaveLength(3);
  });
});

describe('matching rules', () => {
  const tx = (over: object) => ({
    line: 1,
    bookingDate: null,
    amountCents: 2_400_000n,
    payerName: 'Janez Novak',
    reference: 'SI001001-1',
    description: '',
    bankReference: null,
    ...over,
  });

  it('never matches without the sklic, even if name and amount fit', () => {
    const result = matchDeposits([tx({ reference: null })], expectations);
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });

  it('flags a payment made by someone else', () => {
    expect(
      matchDeposits([tx({ payerName: 'Marko Horvat' })], expectations).matches[0]?.confidence,
    ).toBe('NAME_MISMATCH');
  });

  it('keeps the best of two payments with the same sklic', () => {
    const result = matchDeposits(
      [tx({ line: 1, amountCents: 100n }), tx({ line: 2 })],
      expectations,
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ confidence: 'EXACT', transaction: { line: 2 } });
    expect(result.unmatched.map((t) => t.line)).toEqual([1]);
  });

  it('compares names ignoring case, accents, order and legal form', () => {
    expect(namesMatch('Janez Novak', 'NOVAK JANEZ')).toBe(true);
    expect(namesMatch('Nepremičnine Kovač d.o.o.', 'NEPREMICNINE KOVAC DOO')).toBe(true);
    expect(namesMatch('Janez Novak', 'Janez Novak s.p.')).toBe(true);
    expect(namesMatch('Janez Novak', 'Janez Kranjc')).toBe(false);
    expect(namesMatch('Janez Novak', '')).toBe(false);
  });
});
