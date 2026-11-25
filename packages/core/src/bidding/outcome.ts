import { type AuctionStatus, type BidKind } from '@domik/shared';
import { type Actor, type ServiceContext } from '../context';
import { requireOwnAuction, requireTrustee } from '../trustee/access';
import { type AuctionVerification, verifyAuction } from './verify';

export interface OutcomeParty {
  registrationId: string;
  pseudonym: string;
  /** Real identity — visible to the trustee only, never to other bidders. */
  name: string;
}

export interface OutcomeBid extends OutcomeParty {
  seq: number;
  kind: BidKind;
  amountCents: bigint;
  serverTime: Date;
  hash: string;
}

/** The trustee's view of a running or finished auction: who leads / won, the full bid log. */
export interface AuctionOutcome {
  status: AuctionStatus;
  priceCents: bigint | null;
  /** Current leader while running; the winner once ENDED. */
  leader: OutcomeParty | null;
  closedAt: Date | null;
  closedReason: string | null;
  bids: OutcomeBid[];
  verification: AuctionVerification;
}

export async function getAuctionOutcome(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<AuctionOutcome> {
  const { repos } = ctx.uow;
  const trustee = await requireTrustee(repos, actor);
  const auction = await requireOwnAuction(repos, trustee, auctionId);

  const [registrations, bids, verification] = await Promise.all([
    repos.auctionRegistrations.listByAuctionWithBidder(auctionId),
    repos.bids.listByAuctionWithPseudonym(auctionId),
    verifyAuction(ctx, auctionId),
  ]);
  const party = new Map<string, OutcomeParty>(
    registrations.map(({ registration: r, bidder: b }) => [
      r.id,
      {
        registrationId: r.id,
        pseudonym: r.pseudonym,
        name:
          b.type === 'COMPANY' && b.companyName ? `${b.companyName} (${b.fullName})` : b.fullName,
      },
    ]),
  );
  const unknown = (id: string, pseudonym: string): OutcomeParty => ({
    registrationId: id,
    pseudonym,
    name: '—',
  });

  return {
    status: auction.status,
    priceCents: auction.currentPriceCents,
    leader: auction.leadingRegistrationId
      ? (party.get(auction.leadingRegistrationId) ?? null)
      : null,
    closedAt: auction.closedAt,
    closedReason: auction.closedReason,
    bids: bids.map((b) => ({
      ...(party.get(b.registrationId) ?? unknown(b.registrationId, b.pseudonym)),
      seq: b.seq,
      kind: b.kind,
      amountCents: b.amountCents,
      serverTime: b.serverTime,
      hash: b.hash,
    })),
    // The auction exists (ownership was checked above), so verification always has a result.
    verification: verification ?? {
      auctionId,
      valid: false,
      bidCount: 0,
      headHash: '',
      problems: [],
      priceConsistent: false,
    },
  };
}
