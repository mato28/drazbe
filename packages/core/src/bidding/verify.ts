import { type BiddingContext } from './engine';
import { type ChainVerification, verifyBidChain } from './hash';

export interface AuctionVerification extends ChainVerification {
  auctionId: string;
  /** Final price stored on the auction agrees with the bid log. */
  priceConsistent: boolean;
}

/** Re-verifies the stored bid log of an auction (court evidence). */
export async function verifyAuction(
  ctx: Pick<BiddingContext, 'uow'>,
  auctionId: string,
): Promise<AuctionVerification | null> {
  const { repos } = ctx.uow;
  const auction = await repos.auctions.findById(auctionId);
  if (!auction) return null;
  const bids = await repos.bids.listByAuctionWithPseudonym(auctionId);
  const result = verifyBidChain(auctionId, bids);
  const last = bids.at(-1);
  // A pre-emption match equals the highest bid, so the last bid always carries the price.
  const priceConsistent = last
    ? auction.currentPriceCents === last.amountCents
    : auction.type === 'DESCENDING' || auction.currentPriceCents === null;
  return {
    ...result,
    auctionId,
    priceConsistent,
    valid: result.valid && priceConsistent,
  };
}
