import type { SaleRow } from '@domik/db';

// LEGAL-REVIEW: post-sale deadlines and down payment — see docs/legal-review.md
/** Defaults for the sale contract; the trustee may change them before generating the contract. */
export const SALE_DEFAULTS = {
  /** The buyer must sign the contract within this many days after the auction. */
  contractDays: 15,
  /** Down payment (are) as % of the price; the deposit counts towards it. */
  downPaymentPercent: 10,
  downPaymentDays: 15,
  /** Remaining price due this many days after signing. */
  priceDays: 90,
} as const;

const DAY_MS = 86_400_000;
export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);

export function defaultDownPaymentCents(priceCents: bigint): bigint {
  return (priceCents * BigInt(SALE_DEFAULTS.downPaymentPercent)) / 100n;
}

export interface SaleAmounts {
  priceCents: bigint;
  depositAppliedCents: bigint;
  /** Still to pay as down payment after the deposit is credited (>= 0). */
  downPaymentDueCents: bigint;
  /** Still to pay after the down payment. */
  remainderCents: bigint;
  /** Everything still to pay after the deposit. */
  totalDueCents: bigint;
}

export function saleAmounts(
  s: Pick<SaleRow, 'priceCents' | 'depositAppliedCents' | 'downPaymentCents'>,
): SaleAmounts {
  const credited = s.depositAppliedCents;
  const downPaymentDueCents = s.downPaymentCents > credited ? s.downPaymentCents - credited : 0n;
  const totalDueCents = s.priceCents > credited ? s.priceCents - credited : 0n;
  return {
    priceCents: s.priceCents,
    depositAppliedCents: credited,
    downPaymentDueCents,
    remainderCents: totalDueCents - downPaymentDueCents,
    totalDueCents,
  };
}
