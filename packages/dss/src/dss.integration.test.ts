/**
 * Against a running EU DSS (`pnpm dss:up`, then `pnpm --filter @domik/dss test`).
 * Skipped when DSS is not reachable at DSS_URL (default http://localhost:8089).
 */
import { evaluateSignatures } from '@domik/core';
import { renderDocumentPdf } from '@domik/pdf';
import { beforeAll, describe, expect, it } from 'vitest';
import { DssSignatureValidator } from './client';
import { createTestCertificate, signPdf } from './test-signing';

const DSS_URL = process.env.DSS_URL ?? 'http://localhost:8089';

async function reachable(): Promise<boolean> {
  try {
    await fetch(DSS_URL, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}
const available = await reachable();
if (!available) console.warn(`[dss] DSS not reachable at ${DSS_URL} — integration tests skipped`);

const dss = new DssSignatureValidator(DSS_URL);
const NOW = new Date();
const dev = { requireQualified: false };
const BUYER = 'Dražitelj Test 2';
const TRUSTEE = 'Test Upravitelj';

describe.skipIf(!available)('EU DSS validation of test-signed PDFs', () => {
  let contract: Uint8Array;
  let buyerSigned: Buffer;
  let bothSigned: Buffer;

  beforeAll(async () => {
    contract = await renderDocumentPdf({
      title: 'PRODAJNA POGODBA',
      sections: [{ heading: '1. člen', paragraphs: ['Testna pogodba za preverjanje podpisa.'] }],
    });
    buyerSigned = await signPdf(contract, createTestCertificate(BUYER));
    bothSigned = await signPdf(buyerSigned, createTestCertificate(TRUSTEE));
  }, 60_000);

  it('an unsigned PDF has no signatures', async () => {
    const report = await dss.validate({ bytes: contract, filename: 'pogodba.pdf' });
    expect(report.signatures).toEqual([]);
  });

  it("validates the buyer's signature: intact, signer named, not qualified (test certificate)", async () => {
    const report = await dss.validate({ bytes: buyerSigned, filename: 'pogodba-kupec.pdf' });
    expect(report.signatures).toHaveLength(1);
    const [s] = report.signatures;
    expect(s?.signedBy).toContain('Test 2');
    expect(s?.indication).not.toMatch(/FAILED/);
    expect(evaluateSignatures(report, [BUYER], dev, NOW)).toMatchObject({ ok: true });
    expect(evaluateSignatures(report, [BUYER], { requireQualified: true }, NOW).ok).toBe(false);
  }, 60_000);

  it('validates both signatures of the counter-signed contract', async () => {
    const report = await dss.validate({ bytes: bothSigned, filename: 'pogodba-podpisana.pdf' });
    expect(report.signatures).toHaveLength(2);
    expect(evaluateSignatures(report, [BUYER, TRUSTEE], dev, NOW)).toMatchObject({
      ok: true,
      problems: [],
    });
  }, 60_000);

  it('detects a document changed after signing', async () => {
    const tampered = Buffer.from(buyerSigned);
    // A byte inside the signed range (the binary comment line after the header).
    const i = tampered.indexOf('Testna');
    const at = i >= 0 ? i : 12;
    tampered[at] = (tampered[at] ?? 0) ^ 0x01;
    const report = await dss.validate({ bytes: tampered, filename: 'spremenjena.pdf' });
    const check = evaluateSignatures(report, [BUYER], dev, NOW);
    expect(check.ok).toBe(false);
  }, 60_000);
});
