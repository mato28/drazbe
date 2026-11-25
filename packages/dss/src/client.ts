import {
  type SignatureInfo,
  type SignatureValidationReport,
  type SignatureValidator,
} from '@domik/core';

/**
 * Client of the EU DSS (Digital Signature Service) REST validation API —
 * `POST /services/rest/validation/validateSignature`. DSS validates PAdES/XAdES/CAdES/JAdES
 * signatures against the EU trusted lists and reports the eIDAS qualification (QES).
 */
export class DssSignatureValidator implements SignatureValidator {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async validate(file: {
    bytes: Uint8Array;
    filename: string;
  }): Promise<SignatureValidationReport> {
    const res = await fetch(
      `${this.baseUrl.replace(/\/$/, '')}/services/rest/validation/validateSignature`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          signedDocument: {
            bytes: Buffer.from(file.bytes).toString('base64'),
            digestAlgorithm: null,
            name: file.filename,
          },
          originalDocuments: [],
          policy: null,
          signatureId: null,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );
    if (!res.ok) {
      throw new Error(
        `DSS validation failed: HTTP ${String(res.status)} ${(await res.text()).slice(0, 300)}`,
      );
    }
    return parseDssResponse(await res.json());
  }
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  // DSS serializes some enums as {"value": "...", "description": "..."}.
  if (isObject(v) && typeof v.value === 'string') return v.value;
  return null;
};

/** Signatures from a DSS WSReportsDTO (`SimpleReport`). Tolerates DSS 5.x and 6.x JSON shapes. */
export function parseDssResponse(body: unknown): SignatureValidationReport {
  const simple = isObject(body) ? body.SimpleReport : undefined;
  if (!isObject(simple)) throw new Error('DSS response has no SimpleReport');
  const entries =
    simple.signatureOrTimestampOrEvidenceRecord ??
    simple.signatureOrTimestamp ??
    simple.Signature ??
    [];
  const list = Array.isArray(entries) ? entries : [entries];
  const signatures: SignatureInfo[] = [];
  for (const entry of list) {
    if (!isObject(entry)) continue;
    // 6.x/5.x wrap each item: {"Signature": {...}} or {"Timestamp": {...}}.
    const s = isObject(entry.Signature)
      ? entry.Signature
      : 'SignatureFormat' in entry
        ? entry
        : null;
    if (!s) continue;
    const signingTime = text(s.SigningTime);
    signatures.push({
      signedBy: text(s.SignedBy),
      indication: text(s.Indication) ?? 'INDETERMINATE',
      subIndication: text(s.SubIndication),
      qualification: text(s.SignatureLevel),
      signingTime: signingTime ? new Date(signingTime) : null,
      format: text(s.SignatureFormat),
    });
  }
  return { signatures };
}
