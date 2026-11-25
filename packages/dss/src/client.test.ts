import { describe, expect, it } from 'vitest';
import { parseDssResponse } from './client';

describe('parseDssResponse', () => {
  it('reads signatures from a DSS 6.x simple report and skips timestamps', () => {
    const report = parseDssResponse({
      SimpleReport: {
        ValidationTime: '2026-11-17T12:00:00Z',
        signatureOrTimestampOrEvidenceRecord: [
          {
            Signature: {
              Id: 'S-1',
              SignedBy: 'MAJA KOVAČ',
              Indication: 'TOTAL_PASSED',
              SignatureLevel: { value: 'QESig', description: 'Qualified Electronic Signature' },
              SigningTime: '2026-11-17T11:59:00Z',
              SignatureFormat: 'PAdES-BASELINE-B',
            },
          },
          { Timestamp: { Id: 'T-1', Indication: 'PASSED' } },
          {
            Signature: {
              Id: 'S-2',
              SignedBy: 'Test Upravitelj',
              Indication: 'INDETERMINATE',
              SubIndication: 'NO_CERTIFICATE_CHAIN_FOUND',
              SignatureLevel: { value: 'NA' },
              SignatureFormat: 'PDF-NOT-ETSI',
            },
          },
        ],
      },
    });
    expect(report.signatures).toEqual([
      {
        signedBy: 'MAJA KOVAČ',
        indication: 'TOTAL_PASSED',
        subIndication: null,
        qualification: 'QESig',
        signingTime: new Date('2026-11-17T11:59:00Z'),
        format: 'PAdES-BASELINE-B',
      },
      {
        signedBy: 'Test Upravitelj',
        indication: 'INDETERMINATE',
        subIndication: 'NO_CERTIFICATE_CHAIN_FOUND',
        qualification: 'NA',
        signingTime: null,
        format: 'PDF-NOT-ETSI',
      },
    ]);
  });

  it('accepts the 5.x shape and unsigned documents', () => {
    expect(
      parseDssResponse({
        SimpleReport: {
          signatureOrTimestamp: [
            { Signature: { SignedBy: 'X', Indication: 'TOTAL_FAILED', SignatureFormat: 'PAdES' } },
          ],
        },
      }).signatures[0]?.indication,
    ).toBe('TOTAL_FAILED');
    expect(
      parseDssResponse({ SimpleReport: { signatureOrTimestampOrEvidenceRecord: [] } }).signatures,
    ).toEqual([]);
    expect(() => parseDssResponse({})).toThrow();
  });
});
