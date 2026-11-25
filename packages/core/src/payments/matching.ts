import { type BankTransaction } from './bank-statement';
import { compactReference } from './sklic';

/** A registration that is waiting for its deposit. */
export interface DepositExpectation {
  registrationId: string;
  /** Sklic in any spacing ("SI00 1001-1"). */
  paymentReference: string;
  depositCents: bigint;
  /** Names the payment may come from: the person and/or the company. */
  payerNames: string[];
}

export type MatchConfidence =
  /** Reference, amount and payer name all agree. */
  | 'EXACT'
  /** Reference and amount agree, but someone else's name is on the payment. */
  | 'NAME_MISMATCH'
  /** Reference agrees, but the amount is different. Never confirmable as paid in full. */
  | 'AMOUNT_MISMATCH';

export interface DepositMatch {
  transaction: BankTransaction;
  registrationId: string;
  confidence: MatchConfidence;
}

export interface MatchResult {
  matches: DepositMatch[];
  /** Incoming payments that do not belong to any open deposit. */
  unmatched: BankTransaction[];
}

/** Lower-case words without accents, legal forms or punctuation: "Kovač d.o.o." -> ["kovac"]. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(
      /\b(d\.?\s?o\.?\s?o\.?|d\.?\s?d\.?|s\.?\s?p\.?|d\.?\s?n\.?\s?o\.?|k\.?\s?d\.?)(?=\s|$|,)/g,
      ' ',
    )
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Same set of words in any order ("NOVAK JANEZ" = "Janez Novak"); one may contain extra words. */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [small, large] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return small.every((t) => large.has(t));
}

/**
 * Proposes which incoming payments pay which deposits. The sklic is the key: a payment
 * without a matching sklic is never attributed to a registration, however similar the
 * name and amount look. Each registration gets at most one (the best) proposal.
 * The trustee confirms every proposal — nothing is marked paid automatically.
 */
export function matchDeposits(
  transactions: BankTransaction[],
  expectations: DepositExpectation[],
): MatchResult {
  const byReference = new Map<string, DepositExpectation>();
  for (const e of expectations) {
    const key = compactReference(e.paymentReference);
    if (key) byReference.set(key, e);
  }

  const rank: Record<MatchConfidence, number> = { EXACT: 3, NAME_MISMATCH: 2, AMOUNT_MISMATCH: 1 };
  const best = new Map<string, DepositMatch>();
  const unmatched: BankTransaction[] = [];

  for (const tx of transactions) {
    const expectation = tx.reference ? byReference.get(tx.reference) : undefined;
    if (!expectation) {
      unmatched.push(tx);
      continue;
    }
    const confidence: MatchConfidence =
      tx.amountCents !== expectation.depositCents
        ? 'AMOUNT_MISMATCH'
        : expectation.payerNames.some((n) => namesMatch(n, tx.payerName))
          ? 'EXACT'
          : 'NAME_MISMATCH';

    const candidate: DepositMatch = {
      transaction: tx,
      registrationId: expectation.registrationId,
      confidence,
    };
    const current = best.get(expectation.registrationId);
    if (!current) best.set(expectation.registrationId, candidate);
    else if (rank[confidence] > rank[current.confidence]) {
      unmatched.push(current.transaction);
      best.set(expectation.registrationId, candidate);
    } else unmatched.push(tx);
  }

  return { matches: [...best.values()], unmatched };
}
