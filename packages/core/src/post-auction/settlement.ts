import type { AuctionRow, Repositories } from '@domik/db';
import { formatCents, formatDateTime } from '@domik/shared';
import { addDays, defaultDownPaymentCents, SALE_DEFAULTS } from './terms';

export const bidderAuctionUrl = (appUrl: string, auctionId: string): string =>
  `${appUrl}/drazitelj/drazbe/${auctionId}`;
export const trusteeAuctionUrl = (appUrl: string, auctionId: string): string =>
  `${appUrl}/upravitelj/drazbe/${auctionId}`;

const OUTCOME_LABEL: Partial<Record<AuctionRow['status'], string>> = {
  ENDED: 'zaključena z izbranim kupcem',
  UNSUCCESSFUL: 'neuspešna',
  CANCELLED: 'preklicana oziroma ustavljena',
};

// LEGAL-REVIEW: which deposits are refunded, and when — see docs/legal-review.md
/**
 * Runs once when an auction closes (ENDED, UNSUCCESSFUL or CANCELLED), in the same transaction
 * as the status change:
 * - deposits: the winner's is APPLIED to the price, every other paid deposit is REFUND_PENDING;
 * - ENDED: creates the sale record with the contract deadline;
 * - emails to the winner, the other bidders and the trustee (transactional outbox).
 * Idempotent through `auctions.settled_at`.
 */
export async function settleAuction(
  tx: Repositories,
  a: AuctionRow,
  now: Date,
  appUrl: string,
): Promise<AuctionRow> {
  if (a.settledAt !== null) return a;
  const lotTitle = (await tx.lots.findById(a.lotId))?.title ?? '';
  const registrations = await tx.auctionRegistrations.listByAuctionWithBidder(a.id);
  const winnerId = a.status === 'ENDED' ? a.leadingRegistrationId : null;
  const bidderUrl = bidderAuctionUrl(appUrl, a.id);

  for (const { registration: r, bidder } of registrations) {
    const user = await tx.users.findById(bidder.userId);
    const isWinner = r.id === winnerId;
    if (r.depositStatus === 'PAID') {
      await tx.auctionRegistrations.update(r.id, {
        depositStatus: isWinner ? 'APPLIED' : 'REFUND_PENDING',
      });
    }
    if (!user || r.status !== 'APPROVED') continue;

    if (isWinner) {
      // The sale record is created below; the email is queued here with the same deadline.
      continue;
    }
    if (a.status === 'ENDED') {
      await tx.notificationsOutbox.enqueue({
        template: 'auction.lost',
        recipient: user.email,
        payload: { lotTitle, depositAmount: formatCents(a.depositCents), url: bidderUrl },
        dedupeKey: `auction.lost:${r.id}`,
      });
    } else {
      await tx.notificationsOutbox.enqueue({
        template: 'auction.closed',
        recipient: user.email,
        payload: {
          lotTitle,
          outcome: OUTCOME_LABEL[a.status] ?? a.status,
          reason: a.closedReason ?? '',
          depositAmount: formatCents(a.depositCents),
          url: bidderUrl,
        },
        dedupeKey: `auction.closed:${r.id}`,
      });
    }
  }

  if (a.status === 'ENDED' && winnerId && a.currentPriceCents !== null) {
    const winner = registrations.find((x) => x.registration.id === winnerId);
    if (!winner) throw new Error(`winner registration ${winnerId} not found`);
    const contractDeadline = addDays(now, SALE_DEFAULTS.contractDays);
    const sale = await tx.sales.create({
      auctionId: a.id,
      buyerRegistrationId: winnerId,
      priceCents: a.currentPriceCents,
      depositAppliedCents: winner.registration.depositStatus === 'PAID' ? a.depositCents : 0n,
      downPaymentCents: defaultDownPaymentCents(a.currentPriceCents),
      downPaymentDays: SALE_DEFAULTS.downPaymentDays,
      priceDays: SALE_DEFAULTS.priceDays,
      contractDeadline,
    });
    await tx.auditLog.append({
      actorId: null,
      entity: 'sale',
      entityId: sale.id,
      action: 'sale.created',
      after: {
        auctionId: a.id,
        buyer: winner.registration.pseudonym,
        priceCents: sale.priceCents.toString(),
        contractDeadline: contractDeadline.toISOString(),
      },
      at: now,
    });
    const user = await tx.users.findById(winner.bidder.userId);
    if (user) {
      await tx.notificationsOutbox.enqueue({
        template: 'auction.won',
        recipient: user.email,
        payload: {
          lotTitle,
          price: formatCents(a.currentPriceCents),
          contractDeadline: formatDateTime(contractDeadline),
          url: bidderUrl,
        },
        dedupeKey: `auction.won:${winnerId}`,
      });
    }
  }

  // The trustee hears about every outcome.
  const lotWithCase = await tx.lots.findWithCase(a.lotId);
  const trustee = lotWithCase ? await tx.trustees.findById(lotWithCase.case.trusteeId) : undefined;
  const trusteeUser = trustee ? await tx.users.findById(trustee.userId) : undefined;
  if (trusteeUser) {
    await tx.notificationsOutbox.enqueue({
      template: 'auction.result',
      recipient: trusteeUser.email,
      payload: {
        lotTitle,
        outcome: OUTCOME_LABEL[a.status] ?? a.status,
        price: a.status === 'ENDED' && a.currentPriceCents ? formatCents(a.currentPriceCents) : '',
        url: trusteeAuctionUrl(appUrl, a.id),
      },
      dedupeKey: `auction.result:${a.id}`,
    });
  }

  const settled = await tx.auctions.update(a.id, { settledAt: now });
  await tx.auditLog.append({
    actorId: null,
    entity: 'auction',
    entityId: a.id,
    action: 'auction.settled',
    after: {
      status: a.status,
      refundsPending: registrations.filter(
        (x) => x.registration.depositStatus === 'PAID' && x.registration.id !== winnerId,
      ).length,
    },
    at: now,
  });
  return settled ?? a;
}
