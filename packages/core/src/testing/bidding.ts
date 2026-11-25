import type { AuctionRegistrationRow, AuctionRow } from '@domik/db';
import { type AuctionInput } from '@domik/shared';
import * as auctionService from '../auctions/service';
import { advanceAuction } from '../bidding/clock';
import * as caseService from '../cases/service';
import { type Actor } from '../context';
import * as lotService from '../lots/service';
import * as registrationService from '../registrations/service';
import { caseInput, type Harness, lotInput, NOW } from './harness';

export interface TestBidder {
  actor: Actor;
  registration: AuctionRegistrationRow;
}

export interface LiveFixture {
  trustee: Actor;
  auction: AuctionRow;
  bidders: TestBidder[];
  /** Re-reads the auction row. */
  reload: () => Promise<AuctionRow>;
}

export interface LiveFixtureOptions {
  bidders?: number;
  /** Bidder index -> pre-emption rank. */
  preemption?: Record<number, number>;
  /** Leave the auction PUBLISHED instead of starting it. */
  start?: boolean;
}

/**
 * A published auction with approved bidders (identity VERIFIED, deposit PAID), started by the
 * worker clock at `startsAt`. Leaves the harness clock at `startsAt`.
 */
export async function liveAuction(
  h: Harness,
  input: AuctionInput,
  { bidders: count = 2, preemption = {}, start = true }: LiveFixtureOptions = {},
): Promise<LiveFixture> {
  h.clock.set(NOW);
  const trustee = await h.trustee();
  const c = await caseService.createCase(h.ctx, trustee, caseInput());
  const lot = await lotService.createLot(h.ctx, trustee, c.id, lotInput());
  const draft = await auctionService.createAuction(h.ctx, trustee, lot.id, input);
  let auction = await auctionService.publishAuction(h.ctx, trustee, draft.id);

  const { repos } = h.ctx.uow;
  const bidders: TestBidder[] = [];
  for (let i = 0; i < count; i++) {
    const actor = await h.bidder();
    await repos.bidderProfiles.create({
      userId: actor.userId,
      type: 'PERSON',
      fullName: `Dražitelj Test ${i + 1}`,
      taxId: '87654326',
      address: 'Slovenska cesta 1, 1000 Ljubljana',
      status: 'VERIFIED',
      verifiedAt: NOW,
    });
    const reg = await registrationService.registerForAuction(h.ctx, actor, auction.id);
    const rank = preemption[i];
    const registration = await repos.auctionRegistrations.update(reg.id, {
      status: 'APPROVED',
      depositStatus: 'PAID',
      depositPaidAt: NOW,
      approvedBy: trustee.userId,
      approvedAt: NOW,
      ...(rank !== undefined ? { isPreemptionHolder: true, preemptionRank: rank } : {}),
    });
    bidders.push({ actor, registration: registration! });
  }

  if (start) {
    h.clock.set(auction.startsAt);
    await advanceAuction(h.ctx, auction.id);
  }
  const reload = async () => (await repos.auctions.findById(auction.id))!;
  auction = await reload();
  return { trustee, auction, bidders, reload };
}
