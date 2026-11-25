import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { validateXML } from 'xmllint-wasm';
import * as auctionService from './auctions/service';
import { advanceAuction } from './bidding/clock';
import { placeBid } from './bidding/engine';
import { type Actor } from './context';
import { getDocumentDownloadUrl } from './documents/service';
import { generateAuctionReports } from './post-auction/report';
import * as refunds from './post-auction/refunds';
import { runSaleReminders } from './post-auction/reminders';
import * as sales from './post-auction/sale';
import { getBidderPostAuction, getTrusteePostAuction } from './post-auction/views';
import { type SignatureInfo } from './signatures/validator';
import { liveAuction, type LiveFixture } from './testing/bidding';
import { ascendingInput, createHarness, domainError, type Harness } from './testing/harness';

let h: Harness;
beforeAll(() => {
  h = createHarness(inject('databaseUrl'));
});
afterAll(async () => {
  await h.close();
});

const START = new Date('2030-01-10T09:00:00Z');
const END = new Date('2030-01-10T10:00:00Z');
const DAY = 86_400_000;
const after = (from: Date, days: number) => new Date(from.getTime() + days * DAY);
const XSD = readFileSync(
  new URL('./payments/fixtures/pain.001.001.03.xsd', import.meta.url),
  'utf8',
);

const pdf = (label: string) => ({
  bytes: new TextEncoder().encode(`%PDF-1.7\n${label}\n%%EOF`),
  filename: `${label}.pdf`,
});
const sig = (signedBy: string, over: Partial<SignatureInfo> = {}): SignatureInfo => ({
  signedBy,
  indication: 'TOTAL_PASSED',
  subIndication: null,
  qualification: 'QESig',
  signingTime: null,
  format: 'PAdES-BASELINE-B',
  ...over,
});
const emailOf = async (a: Actor) => (await h.ctx.uow.repos.users.findById(a.userId))!.email;
const outbox = async (template: string, recipient: string) =>
  (await h.ctx.uow.repos.notificationsOutbox.listByTemplate(template)).filter(
    (r) => r.recipient === recipient,
  );
const reg = (id: string) => h.ctx.uow.repos.auctionRegistrations.findById(id);

/** 3 bidders; bidder 0 bids the starting price, bidder 1 outbids; the clock ends the auction. */
async function endedAuction(): Promise<LiveFixture & { buyer: Actor }> {
  const f = await liveAuction(h, ascendingInput(), { bidders: 3 });
  const [b0, b1] = f.bidders;
  h.clock.set(new Date(START.getTime() + 60_000));
  await placeBid(h.ctx, b0!.actor, f.auction.id, {
    amountCents: 10_000_000n,
    idempotencyKey: randomUUID(),
  });
  await placeBid(h.ctx, b1!.actor, f.auction.id, {
    amountCents: 11_000_000n,
    idempotencyKey: randomUUID(),
  });
  h.clock.set(END);
  await advanceAuction(h.ctx, f.auction.id);
  return { ...f, auction: await f.reload(), buyer: b1!.actor };
}

describe('post-auction: complete flow', () => {
  it('report -> contract -> QES signatures -> payments -> transfer -> ZK; refunds via pain.001', async () => {
    const f = await endedAuction();
    const [b0, b1, b2] = f.bidders;
    const id = f.auction.id;
    expect(f.auction).toMatchObject({ status: 'ENDED', settledAt: END });

    // Settlement: winner's deposit applied, the others to be refunded, sale with deadline.
    expect((await reg(b1!.registration.id))?.depositStatus).toBe('APPLIED');
    expect((await reg(b0!.registration.id))?.depositStatus).toBe('REFUND_PENDING');
    expect((await reg(b2!.registration.id))?.depositStatus).toBe('REFUND_PENDING');
    const sale = (await h.ctx.uow.repos.sales.findByAuctionId(id))!;
    expect(sale).toMatchObject({
      status: 'AWAITING_CONTRACT',
      buyerRegistrationId: b1!.registration.id,
      priceCents: 11_000_000n,
      depositAppliedCents: 1_000_000n,
      downPaymentCents: 1_100_000n,
      contractDeadline: after(END, 15),
    });

    // Emails: winner, losers (incl. one who did not bid), trustee.
    expect(await outbox('auction.won', await emailOf(b1!.actor))).toHaveLength(1);
    expect(await outbox('auction.lost', await emailOf(b0!.actor))).toHaveLength(1);
    expect(await outbox('auction.lost', await emailOf(b2!.actor))).toHaveLength(1);
    expect(await outbox('auction.result', await emailOf(f.trustee))).toHaveLength(1);

    // Contract needs the report first.
    expect((await domainError(sales.generateContract(h.ctx, f.trustee, id))).code).toBe('CONFLICT');

    // Reports: full (identities) + public (pseudonyms only), each with sha256; idempotent.
    const reports = (await generateAuctionReports(h.ctx, id))!;
    expect(reports.full.kind).toBe('AUCTION_REPORT');
    expect(reports.public.kind).toBe('AUCTION_REPORT_PUBLIC');
    expect(reports.full.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await generateAuctionReports(h.ctx, id)).toBeNull();
    const [publicContent, fullContent] = h.pdf.rendered.slice(-2).map((c) => JSON.stringify(c));
    expect(fullContent).toContain('Dražitelj Test 2');
    expect(publicContent).not.toContain('Dražitelj Test');
    for (const content of [fullContent, publicContent]) {
      expect(content).toContain('110.000,00'); // winning bid
      expect(content).toContain('Končna zgoščena vrednost');
      expect(content).toContain('Brez napak (2 ponudb)');
    }

    // Access: bidders get only the public report.
    expect(await getDocumentDownloadUrl(h.ctx, b0!.actor, reports.public.id)).toBeTruthy();
    expect(
      (await domainError(getDocumentDownloadUrl(h.ctx, b0!.actor, reports.full.id))).code,
    ).toBe('NOT_FOUND');

    // Contract: filled from the template, buyer told.
    const contract = await sales.generateContract(h.ctx, f.trustee, id, { priceDays: 60 });
    expect(contract.kind).toBe('SALE_CONTRACT');
    const contractContent = JSON.stringify(h.pdf.rendered.at(-1));
    expect(contractContent).toContain(reports.full.sha256);
    expect(contractContent).toContain('Dražitelj Test 2');
    expect(contractContent).toContain('v 60 dneh');
    expect(contractContent).not.toContain('{{');
    expect(await outbox('sale.contract_ready', await emailOf(b1!.actor))).toHaveLength(1);
    // Other bidders cannot see the sale documents.
    expect((await domainError(getDocumentDownloadUrl(h.ctx, b0!.actor, contract.id))).code).toBe(
      'NOT_FOUND',
    );
    expect(await getDocumentDownloadUrl(h.ctx, b1!.actor, contract.id)).toBeTruthy();
    // ...and cannot upload in the buyer's place.
    expect(
      (await domainError(sales.uploadBuyerSignedContract(h.ctx, b0!.actor, id, pdf('x')))).code,
    ).toBe('NOT_FOUND');

    // Buyer signature: wrong signer, not qualified, tampered -> rejected (nothing stored).
    h.signatures.report = { signatures: [sig('JANEZ NOVAK')] };
    let e = await domainError(sales.uploadBuyerSignedContract(h.ctx, b1!.actor, id, pdf('a')));
    expect(e).toBeInstanceOf(sales.SignatureRejectedError);
    expect(e.fields?.file).toContain('Manjka veljaven podpis osebe Dražitelj Test 2');
    h.signatures.report = { signatures: [sig('DRAZITELJ TEST 2', { qualification: 'AdESig' })] };
    e = await domainError(sales.uploadBuyerSignedContract(h.ctx, b1!.actor, id, pdf('b')));
    expect(e.fields?.file).toContain('ni kvalificiran');
    h.signatures.report = {
      signatures: [
        sig('DRAZITELJ TEST 2', { indication: 'TOTAL_FAILED', subIndication: 'HASH_FAILURE' }),
      ],
    };
    e = await domainError(sales.uploadBuyerSignedContract(h.ctx, b1!.actor, id, pdf('c')));
    expect(e.fields?.file).toContain('ni veljaven');
    expect((await h.ctx.uow.repos.sales.findById(sale.id))?.buyerSignedDocId).toBeNull();
    // Not a PDF at all.
    e = await domainError(
      sales.uploadBuyerSignedContract(h.ctx, b1!.actor, id, {
        bytes: new Uint8Array([1, 2, 3]),
        filename: 'x.pdf',
      }),
    );
    expect(e.code).toBe('VALIDATION');

    // Valid QES of the buyer (name matched without diacritics / case).
    h.signatures.report = { signatures: [sig('DRAZITELJ TEST 2')] };
    const buyerSigned = await sales.uploadBuyerSignedContract(h.ctx, b1!.actor, id, pdf('kupec'));
    expect(buyerSigned.check.ok).toBe(true);
    expect(buyerSigned.document.kind).toBe('SALE_CONTRACT_SIGNED_BUYER');
    // The contract can no longer be regenerated.
    expect((await domainError(sales.generateContract(h.ctx, f.trustee, id))).code).toBe('CONFLICT');

    // Trustee counter-signs: both signatures must be valid.
    e = await domainError(sales.uploadTrusteeSignedContract(h.ctx, f.trustee, id, pdf('t1')));
    expect(e.fields?.file).toContain('Test Upravitelj');
    h.signatures.report = { signatures: [sig('DRAZITELJ TEST 2'), sig('Test Upravitelj')] };
    const signedAt = after(END, 2);
    h.clock.set(signedAt);
    const signed = await sales.uploadTrusteeSignedContract(h.ctx, f.trustee, id, pdf('obe'));
    expect(signed.sale).toMatchObject({
      status: 'CONTRACT_SIGNED',
      contractSignedAt: signedAt,
      downPaymentDeadline: after(signedAt, 15),
      priceDeadline: after(signedAt, 60),
    });

    // Default cannot be declared before a deadline passes.
    expect((await domainError(sales.declareDefault(h.ctx, f.trustee, id, 'ni plačal'))).code).toBe(
      'CONFLICT',
    );

    // Reminders: 3 days before the down-payment deadline, once; then overdue to both.
    h.clock.set(after(signedAt, 11));
    expect(await runSaleReminders(h.ctx)).toBe(0);
    h.clock.set(after(signedAt, 13));
    expect(await runSaleReminders(h.ctx)).toBe(1);
    expect(await runSaleReminders(h.ctx)).toBe(0);
    h.clock.set(after(signedAt, 16));
    expect(await runSaleReminders(h.ctx)).toBe(2);
    expect(await outbox('sale.overdue', await emailOf(f.trustee))).toHaveLength(1);

    // Steps in order; out-of-order and missing references are refused.
    const step = (s: sales.SaleStep, reference?: string) =>
      sales.recordSaleStep(h.ctx, f.trustee, id, { step: s, ...(reference ? { reference } : {}) });
    expect((await domainError(step('TRANSFER_PROPOSED'))).code).toBe('CONFLICT');
    expect((await step('DOWN_PAYMENT_PAID')).status).toBe('DOWN_PAYMENT_PAID');
    expect((await step('PRICE_PAID')).status).toBe('PRICE_PAID');
    expect((await step('TRANSFER_PROPOSED')).status).toBe('TRANSFER_PROPOSED');
    expect((await domainError(step('TRANSFER_ORDER_ISSUED'))).code).toBe('VALIDATION');
    expect((await step('TRANSFER_ORDER_ISSUED', 'St 1234/2030')).transferOrderRef).toBe(
      'St 1234/2030',
    );
    const done = await step('REGISTERED', 'Dn 5678/2030');
    expect(done).toMatchObject({ status: 'REGISTERED', registrationRef: 'Dn 5678/2030' });
    expect(await runSaleReminders(h.ctx)).toBe(0); // nothing open any more

    // Refunds: IBANs from the bidder (own) or the trustee; never another bidder's.
    expect(
      (await domainError(refunds.generateRefundOrder(h.ctx, f.trustee, id))).message,
    ).toContain('manjka IBAN');
    expect(
      (
        await domainError(
          refunds.setRefundIban(h.ctx, b0!.actor, b2!.registration.id, 'SI56 1910 0000 0123 438'),
        )
      ).code,
    ).toBe('NOT_FOUND');
    expect(
      (
        await domainError(
          refunds.setRefundIban(h.ctx, b0!.actor, b0!.registration.id, 'SI56 1910 0000 0123 439'),
        )
      ).code,
    ).toBe('VALIDATION');
    await refunds.setRefundIban(h.ctx, b0!.actor, b0!.registration.id, 'si56 1910 0000 0123 438');
    const order1 = await refunds.generateRefundOrder(h.ctx, f.trustee, id);
    expect(order1.included.map((p) => p.pseudonym)).toEqual([b0!.registration.pseudonym]);
    expect(order1.missingIban).toEqual([b2!.registration.pseudonym]);

    await refunds.setRefundIban(h.ctx, f.trustee, b2!.registration.id, 'DE89370400440532013000');
    const order2 = await refunds.generateRefundOrder(h.ctx, f.trustee, id, {
      executionDate: '2030-02-01',
    });
    expect(order2.included).toHaveLength(1);
    for (const order of [order1, order2]) {
      const result = await validateXML({
        xml: [{ fileName: 'order.xml', contents: order.xml }],
        schema: [{ fileName: 'pain.001.001.03.xsd', contents: XSD }],
      });
      expect(result.errors).toEqual([]);
      expect(order.document).toMatchObject({ kind: 'REFUND_ORDER', mime: 'application/xml' });
    }
    expect(order1.xml).toContain('<DbtrAcct><Id><IBAN>SI56051008012340041</IBAN></Id></DbtrAcct>');
    expect(order1.xml).toContain('<InstdAmt Ccy="EUR">10000.00</InstdAmt>');
    expect(order1.xml).toContain(`<EndToEndId>${b0!.registration.paymentReference}</EndToEndId>`);
    expect((await domainError(refunds.generateRefundOrder(h.ctx, f.trustee, id))).code).toBe(
      'CONFLICT',
    );
    // In an order: the IBAN is frozen.
    expect(
      (
        await domainError(
          refunds.setRefundIban(h.ctx, b0!.actor, b0!.registration.id, 'SI56191000000123438'),
        )
      ).code,
    ).toBe('CONFLICT');
    // The winner's (applied) deposit cannot be refunded.
    expect(
      (await domainError(refunds.markRefunded(h.ctx, f.trustee, id, [b1!.registration.id]))).code,
    ).toBe('CONFLICT');
    expect(
      await refunds.markRefunded(h.ctx, f.trustee, id, [b0!.registration.id, b2!.registration.id]),
    ).toBe(2);
    expect((await reg(b0!.registration.id))?.depositStatus).toBe('REFUNDED');
    expect(await outbox('deposit.refunded', await emailOf(b2!.actor))).toHaveLength(1);

    // Views.
    const trusteeView = await getTrusteePostAuction(h.ctx, f.trustee, id);
    expect(trusteeView.sale?.sale.status).toBe('REGISTERED');
    expect(trusteeView.refundOrders).toHaveLength(2);
    expect(trusteeView.deposits.map((d) => d.depositStatus).sort()).toEqual([
      'APPLIED',
      'REFUNDED',
      'REFUNDED',
    ]);
    const buyerView = await getBidderPostAuction(h.ctx, b1!.actor, id);
    expect(buyerView.isBuyer).toBe(true);
    expect(buyerView.sale?.signedCheck?.ok).toBe(true);
    const loserView = await getBidderPostAuction(h.ctx, b0!.actor, id);
    expect(loserView).toMatchObject({ isBuyer: false, sale: null });
    expect(loserView.publicReport?.id).toBe(reports.public.id);
    expect((await domainError(getTrusteePostAuction(h.ctx, await h.trustee(), id))).code).toBe(
      'NOT_FOUND',
    );
  });
});

describe('post-auction: other outcomes', () => {
  it('buyer misses the contract deadline -> trustee declares default, deposit forfeited', async () => {
    const f = await endedAuction();
    const sale = (await h.ctx.uow.repos.sales.findByAuctionId(f.auction.id))!;
    h.clock.set(sale.contractDeadline);
    expect(await runSaleReminders(h.ctx)).toBe(2); // overdue: buyer + trustee
    expect(
      (await domainError(sales.declareDefault(h.ctx, f.trustee, f.auction.id, 'x'))).code,
    ).toBe('VALIDATION');
    const defaulted = await sales.declareDefault(
      h.ctx,
      f.trustee,
      f.auction.id,
      'Kupec v roku ni podpisal pogodbe.',
    );
    expect(defaulted).toMatchObject({
      status: 'DEFAULTED',
      defaultReason: 'Kupec v roku ni podpisal pogodbe.',
    });
    expect((await reg(f.bidders[1]!.registration.id))?.depositStatus).toBe('FORFEITED');
    expect(await outbox('sale.defaulted', await emailOf(f.buyer))).toHaveLength(1);
    expect(
      (await domainError(sales.declareDefault(h.ctx, f.trustee, f.auction.id, 'še enkrat'))).code,
    ).toBe('CONFLICT');
    expect(await runSaleReminders(h.ctx)).toBe(0);
  });

  it('contract signed on paper: scan + signing date conclude the contract', async () => {
    const f = await endedAuction();
    await generateAuctionReports(h.ctx, f.auction.id);
    h.clock.set(after(END, 3));
    expect(
      (
        await domainError(
          sales.markSignedOnPaper(h.ctx, f.trustee, f.auction.id, {
            ...pdf('scan'),
            signedAt: after(END, 4),
          }),
        )
      ).code,
    ).toBe('VALIDATION');
    const { sale, document } = await sales.markSignedOnPaper(h.ctx, f.trustee, f.auction.id, {
      ...pdf('scan'),
      signedAt: after(END, 1),
    });
    expect(document.kind).toBe('SALE_CONTRACT_PAPER_SCAN');
    expect(sale).toMatchObject({
      status: 'CONTRACT_SIGNED',
      signedOnPaper: true,
      priceDeadline: after(END, 91),
    });
    // The price paid in full also covers the down payment.
    const paid = await sales.recordSaleStep(h.ctx, f.trustee, f.auction.id, { step: 'PRICE_PAID' });
    expect(paid.downPaymentPaidAt).toEqual(after(END, 3));
  });

  it('no bids -> UNSUCCESSFUL, no sale, every paid deposit refundable', async () => {
    const f = await liveAuction(h, ascendingInput(), { bidders: 2 });
    h.clock.set(END);
    await advanceAuction(h.ctx, f.auction.id);
    expect((await f.reload()).status).toBe('UNSUCCESSFUL');
    expect(await h.ctx.uow.repos.sales.findByAuctionId(f.auction.id)).toBeUndefined();
    for (const b of f.bidders) {
      expect((await reg(b.registration.id))?.depositStatus).toBe('REFUND_PENDING');
      expect(await outbox('auction.closed', await emailOf(b.actor))).toHaveLength(1);
    }
    const reports = await generateAuctionReports(h.ctx, f.auction.id);
    expect(JSON.stringify(h.pdf.rendered.at(-1))).toContain('nobena ponudba');
    expect(reports).not.toBeNull();
  });

  it('trustee stops a live auction -> settled, deposits refundable', async () => {
    const f = await liveAuction(h, ascendingInput(), { bidders: 1 });
    const stopped = await auctionService.stopAuction(
      h.ctx,
      f.trustee,
      f.auction.id,
      'Upnik je umaknil soglasje.',
    );
    expect(stopped.settledAt).not.toBeNull();
    expect((await reg(f.bidders[0]!.registration.id))?.depositStatus).toBe('REFUND_PENDING');
  });
});
