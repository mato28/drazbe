import { formatDateTime } from '@domik/shared';
import { type ServiceContext } from '../context';
import { currentDeadline } from './sale';
import { bidderAuctionUrl, trusteeAuctionUrl } from './settlement';

/** A reminder goes out this long before a deadline. */
export const REMINDER_BEFORE_MS = 3 * 86_400_000;

/**
 * Worker job: reminds buyers of upcoming deadlines (contract, down payment, price) and tells
 * buyer and trustee when one has passed. Idempotent via outbox dedupe keys; returns the
 * number of emails queued.
 */
export async function runSaleReminders(
  ctx: Pick<ServiceContext, 'uow' | 'clock' | 'appUrl'>,
): Promise<number> {
  const { repos } = ctx.uow;
  const now = ctx.clock.now();
  let queued = 0;
  for (const s of await repos.sales.listOpenDetailed()) {
    const d = currentDeadline(s.sale);
    if (!d) continue;
    const buyer = await repos.users.findById(s.buyer.userId);
    const key = `${s.sale.id}:${d.kind}:${d.at.toISOString()}`;
    const base = { lotTitle: s.lot.title, task: d.task, deadline: formatDateTime(d.at) };

    if (now.getTime() >= d.at.getTime()) {
      const sent = await Promise.all([
        buyer &&
          repos.notificationsOutbox.enqueue({
            template: 'sale.overdue',
            recipient: buyer.email,
            payload: {
              ...base,
              forTrustee: false,
              url: bidderAuctionUrl(ctx.appUrl, s.auction.id),
            },
            dedupeKey: `sale.overdue:${key}:buyer`,
          }),
        repos.notificationsOutbox.enqueue({
          template: 'sale.overdue',
          recipient: s.trusteeUser.email,
          payload: { ...base, forTrustee: true, url: trusteeAuctionUrl(ctx.appUrl, s.auction.id) },
          dedupeKey: `sale.overdue:${key}:trustee`,
        }),
      ]);
      queued += sent.filter(Boolean).length;
    } else if (buyer && now.getTime() >= d.at.getTime() - REMINDER_BEFORE_MS) {
      const row = await repos.notificationsOutbox.enqueue({
        template: 'sale.reminder',
        recipient: buyer.email,
        payload: { ...base, url: bidderAuctionUrl(ctx.appUrl, s.auction.id) },
        dedupeKey: `sale.reminder:${key}`,
      });
      if (row) queued += 1;
    }
  }
  return queued;
}
