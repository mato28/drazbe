import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateXML } from 'xmllint-wasm';
import { buildPain001, formatAmount, sepaText } from './pain001';

// Official ISO 20022 schema (iso20022.org), stored as a fixture.
const XSD = readFileSync(new URL('./fixtures/pain.001.001.03.xsd', import.meta.url), 'utf8');

async function validate(xml: string) {
  return validateXML({
    xml: [{ fileName: 'refund.xml', contents: xml }],
    schema: [{ fileName: 'pain.001.001.03.xsd', contents: XSD }],
  });
}

const input = {
  messageId: 'DOMIK-1001-20300110120000',
  createdAt: new Date('2030-01-10T12:00:00.123Z'),
  executionDate: '2030-01-11',
  debtor: { name: 'Dolžnik d.o.o. – v stečaju', iban: 'SI56 0510 0801 2340 041' },
  payments: [
    {
      endToEndId: 'SI00 1001-1',
      amountCents: 1_000_000n,
      creditorName: 'Janez Novak',
      creditorIban: 'SI56 1910 0000 0123 438',
      remittance: 'Vračilo varščine, dražba 1001, sklic SI00 1001-1',
    },
    {
      endToEndId: 'SI00 1001-2',
      amountCents: 1_000_005n,
      creditorName: 'Kovač & Đurić d.o.o. <test>',
      creditorIban: 'DE89370400440532013000',
      remittance: 'Vračilo varščine, dražba 1001, sklic SI00 1001-2',
    },
  ],
};

describe('pain.001.001.03', () => {
  it('is valid against the official XSD', async () => {
    const xml = buildPain001(input);
    const result = await validate(xml);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('carries the totals, accounts and SEPA-safe text', () => {
    const xml = buildPain001(input);
    expect(xml.match(/<NbOfTxs>2<\/NbOfTxs>/g)).toHaveLength(2);
    expect(xml.match(/<CtrlSum>20000.05<\/CtrlSum>/g)).toHaveLength(2);
    expect(xml).toContain('<DbtrAcct><Id><IBAN>SI56051008012340041</IBAN></Id></DbtrAcct>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">10000.05</InstdAmt>');
    expect(xml).toContain('<Nm>Kovac Duric d.o.o. test</Nm>');
    expect(xml).toContain('<Ustrd>Vracilo varscine, drazba 1001, sklic SI00 1001-1</Ustrd>');
    expect(xml).toContain('<CreDtTm>2030-01-10T12:00:00Z</CreDtTm>');
    expect(xml).toContain('<ChrgBr>SLEV</ChrgBr>');
  });

  it('a malformed file fails the XSD (the validator is really checking)', async () => {
    const broken = buildPain001(input).replace('<ChrgBr>SLEV</ChrgBr>', '<ChrgBr>NOPE</ChrgBr>');
    expect((await validate(broken)).valid).toBe(false);
  });

  it('rejects empty orders and non-positive amounts', () => {
    expect(() => buildPain001({ ...input, payments: [] })).toThrow();
    expect(() =>
      buildPain001({ ...input, payments: [{ ...input.payments[0]!, amountCents: 0n }] }),
    ).toThrow();
  });

  it('helpers', () => {
    expect(formatAmount(5n)).toBe('0.05');
    expect(formatAmount(123_456n)).toBe('1234.56');
    expect(sepaText('Šef  Čuk – Žiri', 70)).toBe('Sef Cuk Ziri');
    expect(sepaText('x'.repeat(80), 70)).toHaveLength(70);
  });
});
