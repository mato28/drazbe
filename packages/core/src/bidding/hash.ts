import { createHash } from 'node:crypto';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** prevHash of the first bid of an auction (matches the DB chain trigger). */
export function genesisHash(auctionId: string): string {
  return sha256(auctionId);
}

export interface BidHashInput {
  prevHash: string;
  auctionId: string;
  pseudonym: string;
  amountCents: bigint;
  serverTime: Date;
  seq: number;
}

/** sha256(prevHash | auctionId | bidderPseudonym | amountCents | serverTimeISO | seq), see CLAUDE.md. */
export function bidHash(b: BidHashInput): string {
  return sha256(
    [
      b.prevHash,
      b.auctionId,
      b.pseudonym,
      b.amountCents.toString(),
      b.serverTime.toISOString(),
      String(b.seq),
    ].join('|'),
  );
}

export interface ChainBid extends BidHashInput {
  hash: string;
}

export interface ChainProblem {
  seq: number;
  problem: string;
}

export interface ChainVerification {
  valid: boolean;
  bidCount: number;
  /** Hash of the last bid (or the genesis hash when there are none): the seal of the log. */
  headHash: string;
  problems: ChainProblem[];
}

/**
 * Re-verifies an auction's bid log from scratch: seq must be 1..n without gaps, every prevHash
 * must equal the previous hash and every hash must recompute from the stored data.
 * Any tampering (changed amount/time/pseudonym, deleted or inserted bid) is reported.
 */
export function verifyBidChain(auctionId: string, bids: readonly ChainBid[]): ChainVerification {
  const problems: ChainProblem[] = [];
  let expectedPrev = genesisHash(auctionId);
  const sorted = [...bids].sort((a, b) => a.seq - b.seq);

  sorted.forEach((b, i) => {
    if (b.auctionId !== auctionId) {
      problems.push({ seq: b.seq, problem: 'bid belongs to another auction' });
    }
    if (b.seq !== i + 1) {
      problems.push({ seq: b.seq, problem: `expected seq ${i + 1} (gap or duplicate)` });
    }
    if (b.prevHash !== expectedPrev) {
      problems.push({ seq: b.seq, problem: 'prevHash does not match the previous bid' });
    }
    const recomputed = bidHash({ ...b, auctionId });
    if (recomputed !== b.hash) {
      problems.push({ seq: b.seq, problem: 'hash does not match the bid data' });
    }
    expectedPrev = b.hash;
  });

  return {
    valid: problems.length === 0,
    bidCount: sorted.length,
    headHash: expectedPrev,
    problems,
  };
}
