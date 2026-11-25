/**
 * Electronic-signature validation port. MVP implementation: EU DSS (packages/dss) — the
 * reference validator of the European Commission (eIDAS, PAdES/XAdES/CAdES, EU trusted lists).
 */
export interface SignatureInfo {
  /** Signer as named in the certificate (usually the CN). */
  signedBy: string | null;
  /** ETSI EN 319 102-1: TOTAL_PASSED | TOTAL_FAILED | INDETERMINATE (| PASSED/FAILED for some). */
  indication: string;
  subIndication: string | null;
  /** Signature qualification, e.g. "QESig" (qualified electronic signature), "AdESig", "NA". */
  qualification: string | null;
  signingTime: Date | null;
  format: string | null;
}

export interface SignatureValidationReport {
  signatures: SignatureInfo[];
}

export interface SignatureValidator {
  validate(file: { bytes: Uint8Array; filename: string }): Promise<SignatureValidationReport>;
}

/** A validator that is not configured / reachable: every check fails with a clear message. */
export class UnavailableSignatureValidator implements SignatureValidator {
  validate(): Promise<SignatureValidationReport> {
    return Promise.reject(new Error('signature validation service is not configured'));
  }
}
