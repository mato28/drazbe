import { type SignatureInfo, type SignatureValidationReport } from './validator';

export interface SignaturePolicy {
  /**
   * Production: only a valid QUALIFIED electronic signature (QES) counts.
   * Development (false): a signature whose certificate chain is not trusted is accepted too,
   * as long as it is cryptographically intact — so test certificates can be used.
   */
  requireQualified: boolean;
}

/** Stored with the uploaded document: what was checked, when, and why it passed or failed. */
export interface SignatureCheck {
  ok: boolean;
  checkedAt: string;
  requireQualified: boolean;
  problems: string[];
  signatures: {
    signedBy: string | null;
    indication: string;
    subIndication: string | null;
    qualification: string | null;
    signingTime: string | null;
    matches: string | null;
  }[];
}

/** Lower-case, no diacritics, single spaces: "Kovač  Maja" ~ "MAJA KOVAC". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every word of the expected name appears in the certificate name (order-independent). */
export function nameMatches(certificateName: string | null, expected: string): boolean {
  if (!certificateName) return false;
  const have = new Set(normalizeName(certificateName).split(' '));
  const want = normalizeName(expected).split(' ').filter(Boolean);
  return want.length > 0 && want.every((w) => have.has(w));
}

const UNTRUSTED_BUT_INTACT = new Set(['NO_CERTIFICATE_CHAIN_FOUND', 'NO_POE', 'TRY_LATER']);

/** Does this signature count under the policy? Returns a Slovenian reason if not. */
export function signatureProblem(s: SignatureInfo, policy: SignaturePolicy): string | null {
  const who = s.signedBy ?? 'neznan podpisnik';
  if (s.indication === 'TOTAL_FAILED' || s.indication === 'FAILED') {
    return `Podpis (${who}) ni veljaven – dokument je bil po podpisu spremenjen ali je podpis poškodovan.`;
  }
  if (policy.requireQualified) {
    if (s.indication !== 'TOTAL_PASSED' && s.indication !== 'PASSED') {
      return `Podpisa (${who}) ni bilo mogoče potrditi (${s.subIndication ?? s.indication}).`;
    }
    if (!s.qualification?.startsWith('QES')) {
      return `Podpis (${who}) ni kvalificiran elektronski podpis.`;
    }
    return null;
  }
  const passed = s.indication === 'TOTAL_PASSED' || s.indication === 'PASSED';
  const intact =
    s.indication === 'INDETERMINATE' && UNTRUSTED_BUT_INTACT.has(s.subIndication ?? '');
  return passed || intact ? null : `Podpisa (${who}) ni bilo mogoče potrditi.`;
}

// LEGAL-REVIEW: QES requirement and signer identification by name — see docs/legal-review.md
/**
 * Checks that every expected signer has a signature that counts under the policy.
 * `expectedSigners` are names as recorded on the platform (buyer, trustee).
 */
export function evaluateSignatures(
  report: SignatureValidationReport,
  expectedSigners: string[],
  policy: SignaturePolicy,
  now: Date,
): SignatureCheck {
  const problems: string[] = [];
  if (report.signatures.length === 0) {
    problems.push('Dokument ne vsebuje elektronskega podpisa.');
  }
  const matched = new Map<string, string>();
  const signatures = report.signatures.map((s) => {
    const name = expectedSigners.find((e) => nameMatches(s.signedBy, e)) ?? null;
    const problem = signatureProblem(s, policy);
    if (problem && name) problems.push(problem);
    if (!problem && name) matched.set(name, s.signedBy ?? name);
    return {
      signedBy: s.signedBy,
      indication: s.indication,
      subIndication: s.subIndication,
      qualification: s.qualification,
      signingTime: s.signingTime?.toISOString() ?? null,
      matches: name,
    };
  });
  for (const expected of expectedSigners) {
    if (!matched.has(expected) && report.signatures.length > 0) {
      const found = report.signatures.map((s) => s.signedBy ?? '?').join(', ');
      problems.push(`Manjka veljaven podpis osebe ${expected} (v dokumentu so podpisi: ${found}).`);
    }
  }
  const unique = [...new Set(problems)];
  return {
    ok: unique.length === 0,
    checkedAt: now.toISOString(),
    requireQualified: policy.requireQualified,
    problems: unique,
    signatures,
  };
}
