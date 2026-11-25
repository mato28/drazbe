import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bidHash, type ChainBid, genesisHash, verifyBidChain } from './hash';

const AUCTION = '0b8a4c55-3f7e-4a63-9d0c-5a1f2e7b9c01';

function chain(n: number): ChainBid[] {
  const out: ChainBid[] = [];
  let prev = genesisHash(AUCTION);
  for (let seq = 1; seq <= n; seq++) {
    const b = {
      prevHash: prev,
      auctionId: AUCTION,
      pseudonym: `Dražitelj ${String((seq % 2) + 1)}`,
      amountCents: 10_000_000n + BigInt(seq) * 100_000n,
      serverTime: new Date(Date.UTC(2030, 0, 10, 9, 0, seq)),
      seq,
    };
    const hash = bidHash(b);
    out.push({ ...b, hash });
    prev = hash;
  }
  return out;
}

describe('bid hash chain', () => {
  it('genesis is sha256 of the auction id (same as the DB trigger)', () => {
    expect(genesisHash(AUCTION)).toBe(createHash('sha256').update(AUCTION).digest('hex'));
  });

  it('hash is sha256(prevHash|auctionId|pseudonym|amountCents|serverTimeISO|seq)', () => {
    const [b] = chain(1);
    const expected = createHash('sha256')
      .update(
        `${genesisHash(AUCTION)}|${AUCTION}|Dražitelj 2|10100000|2030-01-10T09:00:01.000Z|1`,
        'utf8',
      )
      .digest('hex');
    expect(b!.hash).toBe(expected);
  });

  it('verifies an intact chain', () => {
    const bids = chain(5);
    expect(verifyBidChain(AUCTION, bids)).toEqual({
      valid: true,
      bidCount: 5,
      headHash: bids[4]!.hash,
      problems: [],
    });
    expect(verifyBidChain(AUCTION, [])).toMatchObject({
      valid: true,
      headHash: genesisHash(AUCTION),
    });
  });

  it('detects a changed amount', () => {
    const bids = chain(3);
    bids[1] = { ...bids[1]!, amountCents: bids[1]!.amountCents + 1n };
    expect(verifyBidChain(AUCTION, bids).problems).toEqual([
      { seq: 2, problem: 'hash does not match the bid data' },
    ]);
  });

  it('detects a changed time or pseudonym even if the hash is recomputed', () => {
    const bids = chain(3);
    const forged = { ...bids[1]!, serverTime: new Date(Date.UTC(2030, 0, 10, 8, 0, 0)) };
    bids[1] = { ...forged, hash: bidHash(forged) };
    // The forged hash breaks the link to the next bid.
    expect(verifyBidChain(AUCTION, bids).problems).toEqual([
      { seq: 3, problem: 'prevHash does not match the previous bid' },
    ]);
  });

  it('detects a deleted bid', () => {
    const bids = chain(4);
    bids.splice(1, 1);
    const result = verifyBidChain(AUCTION, bids);
    expect(result.valid).toBe(false);
    expect(result.problems.map((p) => p.seq)).toContain(3);
  });
});
