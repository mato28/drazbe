import type { AuctionRegistrationRow, DocumentRow } from '@domik/db';
import { formatCents } from '@domik/shared';
import { type Actor, type ServiceContext } from '../context';
import { storeGeneratedDocument } from '../documents/service';
import { DomainError, notFound, validationError } from '../errors';
import { buildPain001 } from '../payments/pain001';
import { requireOwnAuction, requireTrustee } from '../trustee/access';
import { isValidIban, normalizeIban } from '../validation/iban';
import { bidderAuctionUrl } from './settlement';

/** Deposit states in which the refund account can still be changed. */
const IBAN_EDITABLE: AuctionRegistrationRow['depositStatus'][] = [
  'PENDING',
  'PAID',
  'REFUND_PENDING',
];

function parseIban(input: string): string {
  const iban = normalizeIban(input);
  if (!isValidIban(iban)) throw validationError({ iban: 'IBAN ni veljaven.' });
  return iban;
}

/**
 * The bidder (own registration) or the trustee (from the bank statement) records the account
 * a deposit is refunded to. Not possible once the deposit is in a refund order.
 */
export async function setRefundIban(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
  input: string,
): Promise<AuctionRegistrationRow> {
  const iban = parseIban(input);
  return ctx.uow.transaction(async (tx) => {
    const detail = await tx.auctionRegistrations.findDetailed(registrationId);
    if (!detail) throw notFound('Prijava');
    if (actor.role === 'BIDDER') {
      const profile = await tx.bidderProfiles.findByUserId(actor.userId);
      if (detail.registration.bidderId !== profile?.id) throw notFound('Prijava');
    } else {
      const trustee = await requireTrustee(tx, actor);
      if (detail.case.trusteeId !== trustee.id) throw notFound('Prijava');
    }
    const r = detail.registration;
    if (!IBAN_EDITABLE.includes(r.depositStatus) || r.refundOrderDocId) {
      throw new DomainError(
        'CONFLICT',
        'Vračilo varščine je že v obdelavi, računa ni več mogoče spremeniti.',
      );
    }
    const after = await tx.auctionRegistrations.update(r.id, { refundIban: iban });
    if (!after) throw notFound('Prijava');
    await tx.auditLog.append({
      actorId: actor.userId,
      entity: 'auction_registration',
      entityId: r.id,
      action: 'deposit.refund_iban_set',
      before: { refundIban: r.refundIban },
      after: { refundIban: iban },
      at: ctx.clock.now(),
    });
    return after;
  });
}

export interface RefundOrderResult {
  document: DocumentRow;
  xml: string;
  included: { registrationId: string; pseudonym: string; amountCents: bigint }[];
  /** REFUND_PENDING deposits left out because the bidder has no refund IBAN yet. */
  missingIban: string[];
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Trustee: SEPA pain.001.001.03 credit transfers refunding every pending deposit of an
 * auction that has a refund IBAN, debited from the estate account. The trustee uploads the
 * file to their e-bank. The included deposits are marked with the order; after the bank
 * executes it the trustee confirms with `markRefunded`.
 */
export async function generateRefundOrder(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  input: { executionDate?: string } = {},
): Promise<RefundOrderResult> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const auction = await requireOwnAuction(ctx.uow.repos, trustee, auctionId);
  const now = ctx.clock.now();
  const executionDate = input.executionDate ?? isoDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(executionDate) || executionDate < isoDate(now)) {
    throw validationError({ executionDate: 'Datum izvršitve ne sme biti v preteklosti.' });
  }

  const regs = await ctx.uow.repos.auctionRegistrations.listByAuctionWithBidder(auctionId);
  const pending = regs.filter(
    ({ registration: r }) => r.depositStatus === 'REFUND_PENDING' && !r.refundOrderDocId,
  );
  const ready = pending.filter(({ registration: r }) => r.refundIban);
  const missingIban = pending
    .filter(({ registration: r }) => !r.refundIban)
    .map((x) => x.registration.pseudonym);
  if (ready.length === 0) {
    throw new DomainError(
      'CONFLICT',
      missingIban.length > 0
        ? `Za vračilo ni pripravljenih varščin – manjka IBAN: ${missingIban.join(', ')}.`
        : 'Ni varščin, ki bi čakale na vračilo.',
    );
  }

  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  const messageId = `DOMIK-${String(auction.number)}-${stamp}`;
  const included = ready.map(({ registration: r, bidder: b }) => ({
    registrationId: r.id,
    pseudonym: r.pseudonym,
    amountCents: auction.depositCents,
    creditorName: b.type === 'COMPANY' && b.companyName ? b.companyName : b.fullName,
    creditorIban: r.refundIban ?? '',
    reference: r.paymentReference,
  }));
  const xml = buildPain001({
    messageId,
    createdAt: now,
    executionDate,
    debtor: { name: auction.lot.case.debtorName, iban: auction.lot.case.estateIban },
    payments: included.map((p) => ({
      endToEndId: p.reference,
      amountCents: p.amountCents,
      creditorName: p.creditorName,
      creditorIban: p.creditorIban,
      remittance: `Vracilo varscine, drazba ${String(auction.number)}, ${p.reference}`,
    })),
  });

  const document = await storeGeneratedDocument(
    ctx,
    actor.userId,
    {
      ownerType: 'AUCTION',
      ownerId: auctionId,
      kind: 'REFUND_ORDER',
      filename: `vracila-varscin-drazba-${String(auction.number)}-${stamp}.xml`,
      bytes: new TextEncoder().encode(xml),
      mime: 'application/xml',
      extension: 'xml',
      keyPrefix: `auctions/${auctionId}`,
    },
    async (tx, row) => {
      for (const p of included) {
        const current = await tx.auctionRegistrations.findById(p.registrationId);
        if (current?.depositStatus !== 'REFUND_PENDING' || current.refundOrderDocId) {
          throw new DomainError(
            'CONFLICT',
            'Stanje varščin se je medtem spremenilo. Poskusite znova.',
          );
        }
        await tx.auctionRegistrations.update(p.registrationId, { refundOrderDocId: row.id });
      }
      await tx.auditLog.append({
        actorId: actor.userId,
        entity: 'auction',
        entityId: auctionId,
        action: 'deposit.refund_order_created',
        after: {
          documentId: row.id,
          sha256: row.sha256,
          messageId,
          executionDate,
          payments: included.map((p) => ({
            pseudonym: p.pseudonym,
            amountCents: p.amountCents.toString(),
            iban: p.creditorIban,
          })),
        },
        at: now,
      });
    },
  );
  return {
    document,
    xml,
    included: included.map(({ registrationId, pseudonym, amountCents }) => ({
      registrationId,
      pseudonym,
      amountCents,
    })),
    missingIban,
  };
}

/**
 * Trustee: the bank executed the refunds. Marks deposits REFUNDED (those in a refund order,
 * or refunded by other means) and notifies the bidders.
 */
export async function markRefunded(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  registrationIds: string[],
): Promise<number> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const auction = await requireOwnAuction(ctx.uow.repos, trustee, auctionId);
  if (registrationIds.length === 0)
    throw validationError({ registrationIds: 'Izberite vsaj eno varščino.' });
  const now = ctx.clock.now();
  return ctx.uow.transaction(async (tx) => {
    let count = 0;
    for (const id of new Set(registrationIds)) {
      const detail = await tx.auctionRegistrations.findDetailed(id);
      if (detail?.registration.auctionId !== auctionId) throw notFound('Prijava');
      const r = detail.registration;
      if (r.depositStatus !== 'REFUND_PENDING') {
        throw new DomainError('CONFLICT', `Varščina ${r.pseudonym} ne čaka na vračilo.`);
      }
      await tx.auctionRegistrations.update(id, { depositStatus: 'REFUNDED', refundedAt: now });
      await tx.auditLog.append({
        actorId: actor.userId,
        entity: 'auction_registration',
        entityId: id,
        action: 'deposit.refunded',
        before: { depositStatus: r.depositStatus },
        after: {
          depositStatus: 'REFUNDED',
          refundOrderDocId: r.refundOrderDocId,
          iban: r.refundIban,
        },
        at: now,
      });
      const user = await tx.users.findById(detail.bidder.userId);
      if (user) {
        await tx.notificationsOutbox.enqueue({
          template: 'deposit.refunded',
          recipient: user.email,
          payload: {
            lotTitle: auction.lot.title,
            amount: formatCents(auction.depositCents),
            url: bidderAuctionUrl(ctx.appUrl, auctionId),
          },
          dedupeKey: `deposit.refunded:${id}`,
        });
      }
      count += 1;
    }
    return count;
  });
}
