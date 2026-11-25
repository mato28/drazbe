import { type BidderProfileInput } from '@domik/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { type Actor } from './context';
import {
  auctionService,
  bidderService,
  caseService,
  documentService,
  isValidSi00Reference,
  lotService,
  parseUpnQrPayload,
  registrationService,
  requireBiddingAccess,
} from './index';
import {
  ascendingInput,
  caseInput,
  createHarness,
  domainError,
  type Harness,
  lotInput,
  NOW,
  PDF_BYTES,
  PNG_BYTES,
} from './testing/harness';

let h: Harness;
beforeAll(() => {
  h = createHarness(inject('databaseUrl'));
});
afterAll(async () => {
  await h.close();
});

const person = (over: Partial<BidderProfileInput> = {}): BidderProfileInput => ({
  type: 'PERSON',
  fullName: 'Janez Novak',
  taxId: '12345679',
  address: 'Slovenska cesta 1, 1000 Ljubljana',
  phone: '041 123 456',
  companyName: null,
  companyRegNo: null,
  representativeName: null,
  actsAsLegalRepresentative: true,
  ...over,
});

const company = (over: Partial<BidderProfileInput> = {}): BidderProfileInput =>
  person({
    type: 'COMPANY',
    fullName: 'Maja Kovač',
    companyName: 'Nepremičnine Kovač d.o.o.',
    companyRegNo: '7654321000',
    representativeName: 'Maja Kovač',
    ...over,
  });

/** A published auction owned by a fresh trustee. */
async function publishedAuction(over = ascendingInput()) {
  const trustee = await h.trustee();
  const c = await caseService.createCase(h.ctx, trustee, caseInput());
  const lot = await lotService.createLot(h.ctx, trustee, c.id, lotInput());
  const draft = await auctionService.createAuction(h.ctx, trustee, lot.id, over);
  const auction = await auctionService.publishAuction(h.ctx, trustee, draft.id);
  return { trustee, case: c, lot, auction };
}

/** A bidder with a complete profile and ID document. */
async function readyBidder(input = person()): Promise<Actor> {
  const bidder = await h.bidder();
  await bidderService.saveProfile(h.ctx, bidder, input);
  await bidderService.uploadDocument(h.ctx, bidder, {
    kind: 'ID_DOCUMENT',
    filename: 'osebna.png',
    bytes: PNG_BYTES,
  });
  return bidder;
}

const outbox = (template: string) => h.ctx.uow.repos.notificationsOutbox.listByTemplate(template);

describe('bidder profile', () => {
  it('creates a PERSON profile, normalizes tax id and phone, and starts as PENDING', async () => {
    const bidder = await h.bidder();
    const p = await bidderService.saveProfile(h.ctx, bidder, person({ taxId: 'SI 12345679' }));
    expect(p).toMatchObject({
      type: 'PERSON',
      taxId: '12345679',
      status: 'PENDING',
      identityProvider: 'manual',
    });
    const o = await bidderService.getOnboarding(h.ctx, bidder);
    expect(o.phone).toBe('+38641123456');
    expect(o.missing).toEqual(['Naložite osebni dokument.']);
  });

  it('validates per type with Slovenian messages', async () => {
    const e = await domainError(
      bidderService.saveProfile(
        h.ctx,
        await h.bidder(),
        company({
          companyName: null,
          companyRegNo: '123',
          representativeName: null,
          taxId: '12345678',
          phone: '12',
        }),
      ),
    );
    expect(e.fields).toEqual({
      taxId: 'Davčna številka ni veljavna (8 številk s kontrolno številko).',
      phone: 'Vnesite telefonsko številko, npr. 041 123 456.',
      companyName: 'Vnesite naziv pravne osebe.',
      companyRegNo: 'Matična številka ima 7 ali 10 številk.',
      representativeName: 'Vnesite zakonitega zastopnika.',
    });
  });

  it('requires a power of attorney when the company is not represented by its legal representative', async () => {
    const bidder = await readyBidder(
      company({ fullName: 'Peter Kralj', actsAsLegalRepresentative: false }),
    );
    expect((await bidderService.getOnboarding(h.ctx, bidder)).missing).toEqual([
      'Naložite pooblastilo zakonitega zastopnika.',
    ]);
    await bidderService.uploadDocument(h.ctx, bidder, {
      kind: 'POWER_OF_ATTORNEY',
      filename: 'pooblastilo.pdf',
      bytes: PDF_BYTES,
    });
    expect((await bidderService.getOnboarding(h.ctx, bidder)).missing).toEqual([]);
  });

  it('asks nothing more of an already verified identity (e.g. verified without uploads)', async () => {
    const bidder = await h.bidder();
    const profile = await bidderService.saveProfile(h.ctx, bidder, person());
    await h.ctx.uow.repos.bidderProfiles.setStatus(profile.id, 'VERIFIED', null, NOW);
    expect((await bidderService.getOnboarding(h.ctx, bidder)).missing).toEqual([]);

    const { auction } = await publishedAuction();
    const reg = await registrationService.registerForAuction(h.ctx, bidder, auction.id);
    expect(reg.pseudonym).toBe('Dražitelj 1');
  });

  it('is only for bidders', async () => {
    expect(
      (await domainError(bidderService.saveProfile(h.ctx, await h.trustee(), person()))).code,
    ).toBe('FORBIDDEN');
  });
});

describe('full flow: profile -> registration -> APPROVED', () => {
  it('takes a bidder from sign-up to an approved registration', async () => {
    const { trustee, auction, case: c } = await publishedAuction();
    const bidder = await readyBidder();

    // Not registered yet: no bidding access.
    expect((await domainError(requireBiddingAccess(h.ctx, bidder, auction.id))).code).toBe(
      'FORBIDDEN',
    );

    // 1. Register: pseudonym + sklic are assigned.
    const reg = await registrationService.registerForAuction(h.ctx, bidder, auction.id);
    expect(reg).toMatchObject({
      seq: 1,
      pseudonym: 'Dražitelj 1',
      status: 'PENDING',
      depositStatus: 'PENDING',
    });
    expect(reg.paymentReference).toBe(`SI00 ${auction.number}-1`);
    expect(isValidSi00Reference(reg.paymentReference)).toBe(true);
    expect(
      (await outbox('registration.received')).some(
        (m) => m.payload.paymentReference === reg.paymentReference,
      ),
    ).toBe(true);

    // 2. Payment data: a valid UPN QR to the debtor's estate account.
    const payment = await registrationService.getMyDepositPayment(h.ctx, bidder, reg.id);
    expect(parseUpnQrPayload(payment.upnQrPayload)).toMatchObject({
      amountCents: auction.depositCents,
      payeeIban: c.estateIban,
      payeeReference: `SI00${auction.number}-1`,
      payeeName: c.debtorName.slice(0, 33).trim(),
      payeeAddress: 'Šmartinska cesta 152',
      payeeCity: '1000 Ljubljana',
      purposeCode: 'OTHR',
      dueDate: '08.01.2030',
    });

    // 3. Pre-filled statement, then the signed upload.
    const { content, filename } = await registrationService.getStatementContent(
      h.ctx,
      bidder,
      reg.id,
    );
    expect(filename).toBe(`izjava-drazba-${auction.number}.pdf`);
    const flat = JSON.stringify(content);
    expect(flat).toContain('Janez Novak');
    expect(flat).toContain('12345679');
    expect(flat).toContain(reg.paymentReference);
    expect(flat).toContain('ne more biti kupec');
    expect(flat).toContain('korak draženja');
    const statement = await registrationService.uploadSignedStatement(h.ctx, bidder, reg.id, {
      filename: 'izjava-podpisana.pdf',
      bytes: PDF_BYTES,
    });
    expect(statement.kind).toBe('EXCLUSION_STATEMENT');

    // Still not approved: no bidding.
    expect((await domainError(requireBiddingAccess(h.ctx, bidder, auction.id))).message).toMatch(
      /še ni potrjena/,
    );

    // 4. Trustee review.
    const review = await registrationService.getRegistrationReview(h.ctx, trustee, reg.id);
    expect(review.bidder.fullName).toBe('Janez Novak');
    expect(review.bidderDocuments.map((d) => d.kind)).toEqual(['ID_DOCUMENT']);
    expect(review.statement?.id).toBe(statement.id);
    expect(review.blockers).toEqual([
      'Identiteta dražitelja še ni potrjena.',
      'Varščina še ni označena kot plačana.',
    ]);
    // The trustee can open the bidder's ID document and the signed statement.
    expect(
      await documentService.getDocumentDownloadUrl(h.ctx, trustee, review.bidderDocuments[0]!.id),
    ).toMatch(/^memory:/);
    expect(await documentService.getDocumentDownloadUrl(h.ctx, trustee, statement.id)).toMatch(
      /^memory:/,
    );

    const tooEarly = await domainError(
      registrationService.approveRegistration(h.ctx, trustee, reg.id),
    );
    expect(tooEarly.code).toBe('CONFLICT');

    const profile = await registrationService.decideIdentity(h.ctx, trustee, reg.id, {
      decision: 'VERIFIED',
    });
    expect(profile).toMatchObject({ status: 'VERIFIED', verifiedBy: trustee.userId });
    const paid = await registrationService.setDeposit(h.ctx, trustee, reg.id, {
      status: 'PAID',
      note: 'izpisek 27. 11.',
    });
    expect(paid).toMatchObject({
      depositStatus: 'PAID',
      depositMarkedBy: trustee.userId,
      depositNote: 'izpisek 27. 11.',
    });
    expect((await domainError(requireBiddingAccess(h.ctx, bidder, auction.id))).code).toBe(
      'FORBIDDEN',
    );

    const approved = await registrationService.approveRegistration(h.ctx, trustee, reg.id);
    expect(approved).toMatchObject({ status: 'APPROVED', approvedBy: trustee.userId });
    expect(approved.approvedAt?.toISOString()).toBe(NOW.toISOString());

    // 5. Now — and only now — the bidder may bid, under the pseudonym.
    expect(await requireBiddingAccess(h.ctx, bidder, auction.id)).toEqual({
      auctionId: auction.id,
      pseudonym: 'Dražitelj 1',
      isPreemptionHolder: false,
    });

    // Emails went to the outbox, and every step is in the audit log.
    for (const t of ['deposit.confirmed', 'registration.approved']) {
      expect((await outbox(t)).some((m) => m.recipient.startsWith('BIDDER-'))).toBe(true);
    }
    const audit = await h.ctx.uow.repos.auditLog.listForEntity('auction_registration', reg.id);
    expect(audit.map((a) => a.action)).toEqual([
      'registration.created',
      'deposit.marked_paid',
      'registration.approved',
    ]);
  });

  it('gives every bidder of an auction a distinct pseudonym and sklic, even when they register at once', async () => {
    const { auction } = await publishedAuction();
    const bidders = await Promise.all(Array.from({ length: 6 }, () => readyBidder()));
    const regs = await Promise.all(
      bidders.map((b) => registrationService.registerForAuction(h.ctx, b, auction.id)),
    );

    expect(regs.map((r) => r.seq).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(regs.map((r) => r.pseudonym)).size).toBe(6);
    expect(new Set(regs.map((r) => r.paymentReference)).size).toBe(6);
    expect(regs.every((r) => r.pseudonym === `Dražitelj ${r.seq}`)).toBe(true);
  });
});

describe('registration rules', () => {
  it('enforces the registration deadline for registering and for the statement', async () => {
    const { auction } = await publishedAuction();
    const early = await readyBidder();
    const reg = await registrationService.registerForAuction(h.ctx, early, auction.id);
    const late = await readyBidder();

    try {
      h.clock.set(new Date('2030-01-08T09:00:00Z')); // exactly the deadline
      const e = await domainError(registrationService.registerForAuction(h.ctx, late, auction.id));
      expect(e).toMatchObject({ code: 'CONFLICT' });
      expect(e.message).toMatch(/Rok za prijavo na dražbo je potekel/);
      expect(
        (
          await domainError(
            registrationService.uploadSignedStatement(h.ctx, early, reg.id, {
              filename: 'i.pdf',
              bytes: PDF_BYTES,
            }),
          )
        ).message,
      ).toMatch(/Rok za prijavo/);
    } finally {
      h.clock.set(NOW);
    }
  });

  it('needs a complete profile, and only once per auction', async () => {
    const { auction } = await publishedAuction();
    const noProfile = await h.bidder();
    expect(
      (await domainError(registrationService.registerForAuction(h.ctx, noProfile, auction.id)))
        .message,
    ).toMatch(/izpolnite podatke dražitelja/);
    const noId = await h.bidder();
    await bidderService.saveProfile(h.ctx, noId, person());
    expect(
      (await domainError(registrationService.registerForAuction(h.ctx, noId, auction.id))).message,
    ).toMatch(/Naložite osebni dokument/);

    const ok = await readyBidder();
    await registrationService.registerForAuction(h.ctx, ok, auction.id);
    expect(
      (await domainError(registrationService.registerForAuction(h.ctx, ok, auction.id))).message,
    ).toBe('Na to dražbo ste že prijavljeni.');
  });

  it('does not allow registering for a draft or by a trustee', async () => {
    const trustee = await h.trustee();
    const c = await caseService.createCase(h.ctx, trustee, caseInput());
    const lot = await lotService.createLot(h.ctx, trustee, c.id, lotInput());
    const draft = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    expect(
      (
        await domainError(
          registrationService.registerForAuction(h.ctx, await readyBidder(), draft.id),
        )
      ).code,
    ).toBe('NOT_FOUND');
    expect(
      (await domainError(registrationService.registerForAuction(h.ctx, trustee, draft.id))).code,
    ).toBe('FORBIDDEN');
  });

  it('replaces the signed statement and removes the old file', async () => {
    const { auction } = await publishedAuction();
    const bidder = await readyBidder();
    const reg = await registrationService.registerForAuction(h.ctx, bidder, auction.id);
    const first = await registrationService.uploadSignedStatement(h.ctx, bidder, reg.id, {
      filename: 'a.pdf',
      bytes: PDF_BYTES,
    });
    const second = await registrationService.uploadSignedStatement(h.ctx, bidder, reg.id, {
      filename: 'b.pdf',
      bytes: PDF_BYTES,
    });
    expect(h.storage.objects.has(first.s3Key)).toBe(false);
    expect(
      (await registrationService.getMyRegistrationForAuction(h.ctx, bidder, auction.id))?.statement
        ?.id,
    ).toBe(second.id);
  });
});

describe('trustee review', () => {
  async function pending() {
    const a = await publishedAuction(ascendingInput({ preemptionEnabled: true }));
    const bidder = await readyBidder();
    const reg = await registrationService.registerForAuction(h.ctx, bidder, a.auction.id);
    return { ...a, bidder, reg };
  }

  it('is limited to the trustee who owns the auction', async () => {
    const { reg, bidder } = await pending();
    const other = await h.trustee();
    const idDoc = (await bidderService.getOnboarding(h.ctx, bidder)).documents[0]!;
    for (const call of [
      () => registrationService.getRegistrationReview(h.ctx, other, reg.id),
      () => registrationService.decideIdentity(h.ctx, other, reg.id, { decision: 'VERIFIED' }),
      () => registrationService.setDeposit(h.ctx, other, reg.id, { status: 'PAID' }),
      () => registrationService.approveRegistration(h.ctx, other, reg.id),
      () => registrationService.rejectRegistration(h.ctx, other, reg.id, 'Razlog za zavrnitev.'),
      // … and a trustee with no registration from this bidder cannot open their ID document.
      () => documentService.getDocumentDownloadUrl(h.ctx, other, idDoc.id),
    ]) {
      expect((await domainError(call())).code).toBe('NOT_FOUND');
    }
  });

  it("keeps bidders out of each other's registrations and documents", async () => {
    const { reg, bidder } = await pending();
    const stranger = await readyBidder();
    const idDoc = (await bidderService.getOnboarding(h.ctx, bidder)).documents[0]!;
    for (const call of [
      () => registrationService.getMyDepositPayment(h.ctx, stranger, reg.id),
      () => registrationService.getStatementContent(h.ctx, stranger, reg.id),
      () =>
        registrationService.uploadSignedStatement(h.ctx, stranger, reg.id, {
          filename: 'x.pdf',
          bytes: PDF_BYTES,
        }),
      () => documentService.getDocumentDownloadUrl(h.ctx, stranger, idDoc.id),
    ]) {
      expect((await domainError(call())).code).toBe('NOT_FOUND');
    }
    expect(await documentService.getDocumentDownloadUrl(h.ctx, bidder, idDoc.id)).toMatch(
      /^memory:/,
    );
  });

  it('rejects an identity with a reason; the bidder corrects the profile and is PENDING again', async () => {
    const { trustee, reg, bidder, auction } = await pending();
    const rejected = await registrationService.decideIdentity(h.ctx, trustee, reg.id, {
      decision: 'REJECTED',
      reason: 'Osebni dokument ni čitljiv.',
    });
    expect(rejected).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Osebni dokument ni čitljiv.',
    });

    // A rejected identity cannot register elsewhere …
    const another = await publishedAuction();
    expect(
      (await domainError(registrationService.registerForAuction(h.ctx, bidder, another.auction.id)))
        .message,
    ).toMatch(/zavrnjena/);
    // … until the profile is resubmitted.
    const fixed = await bidderService.saveProfile(
      h.ctx,
      bidder,
      person({ address: 'Nova ulica 2, 1000 Ljubljana' }),
    );
    expect(fixed).toMatchObject({ status: 'PENDING', rejectionReason: null });
    expect(
      (await registrationService.getMyRegistrationForAuction(h.ctx, bidder, auction.id))
        ?.identityStatus,
    ).toBe('PENDING');
  });

  it('locks a verified profile', async () => {
    const { trustee, reg, bidder } = await pending();
    await registrationService.decideIdentity(h.ctx, trustee, reg.id, { decision: 'VERIFIED' });
    expect((await domainError(bidderService.saveProfile(h.ctx, bidder, person()))).code).toBe(
      'CONFLICT',
    );
    expect(
      (
        await domainError(
          bidderService.uploadDocument(h.ctx, bidder, {
            kind: 'ID_DOCUMENT',
            filename: 'x.png',
            bytes: PNG_BYTES,
          }),
        )
      ).code,
    ).toBe('CONFLICT');
  });

  it('marks and unmarks the deposit, with audit entries', async () => {
    const { trustee, reg } = await pending();
    await registrationService.setDeposit(h.ctx, trustee, reg.id, { status: 'PAID' });
    expect(
      (
        await domainError(
          registrationService.setDeposit(h.ctx, trustee, reg.id, { status: 'PAID' }),
        )
      ).code,
    ).toBe('CONFLICT');
    const undone = await registrationService.setDeposit(h.ctx, trustee, reg.id, {
      status: 'PENDING',
      note: 'napačna prijava',
    });
    expect(undone).toMatchObject({ depositStatus: 'PENDING', depositPaidAt: null });
    const audit = await h.ctx.uow.repos.auditLog.listForEntity('auction_registration', reg.id);
    expect(audit.map((a) => a.action)).toEqual([
      'registration.created',
      'deposit.marked_paid',
      'deposit.unmarked',
    ]);
  });

  it('marks pre-emption holders with unique ranks', async () => {
    const { trustee, reg, auction } = await pending();
    const second = await registrationService.registerForAuction(
      h.ctx,
      await readyBidder(),
      auction.id,
    );

    const holder = await registrationService.setPreemption(h.ctx, trustee, reg.id, {
      isHolder: true,
      rank: 1,
    });
    expect(holder).toMatchObject({ isPreemptionHolder: true, preemptionRank: 1 });
    const dup = await domainError(
      registrationService.setPreemption(h.ctx, trustee, second.id, { isHolder: true, rank: 1 }),
    );
    expect(dup.fields?.rank).toMatch(/že ima drug predkupni upravičenec/);
    await registrationService.setPreemption(h.ctx, trustee, second.id, { isHolder: true, rank: 2 });
    const cleared = await registrationService.setPreemption(h.ctx, trustee, reg.id, {
      isHolder: false,
    });
    expect(cleared).toMatchObject({ isPreemptionHolder: false, preemptionRank: null });

    const plain = await publishedAuction(); // preemption not enabled
    const r = await registrationService.registerForAuction(
      h.ctx,
      await readyBidder(),
      plain.auction.id,
    );
    expect(
      (
        await domainError(
          registrationService.setPreemption(h.ctx, plain.trustee, r.id, {
            isHolder: true,
            rank: 1,
          }),
        )
      ).code,
    ).toBe('CONFLICT');
  });

  it('rejects a registration with a reason and notifies the bidder', async () => {
    const { trustee, reg, bidder, auction } = await pending();
    const rejected = await registrationService.rejectRegistration(
      h.ctx,
      trustee,
      reg.id,
      'Dražitelj je povezana oseba dolžnika.',
    );
    expect(rejected).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Dražitelj je povezana oseba dolžnika.',
    });
    expect((await domainError(requireBiddingAccess(h.ctx, bidder, auction.id))).message).toMatch(
      /zavrnjena/,
    );
    expect(
      (await outbox('registration.rejected')).some(
        (m) => m.payload.reason === 'Dražitelj je povezana oseba dolžnika.',
      ),
    ).toBe(true);
  });

  it('lists the registrations of an auction for its trustee only', async () => {
    const { trustee, auction } = await pending();
    const list = await registrationService.listAuctionRegistrations(h.ctx, trustee, auction.id);
    expect(list.map((r) => r.registration.pseudonym)).toEqual(['Dražitelj 1']);
    expect(
      (
        await domainError(
          registrationService.listAuctionRegistrations(h.ctx, await h.trustee(), auction.id),
        )
      ).code,
    ).toBe('NOT_FOUND');
  });
});

describe('bank statement import', () => {
  const camt = (
    rows: { ref: string; amount: string; payer: string; id: string }[],
  ) => `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
${rows
  .map(
    (r) => `<Ntry><Amt Ccy="EUR">${r.amount}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
<BookgDt><Dt>2030-01-05</Dt></BookgDt><AcctSvcrRef>${r.id}</AcctSvcrRef>
<NtryDtls><TxDtls><RltdPties><Dbtr><Nm>${r.payer}</Nm></Dbtr></RltdPties>
<RmtInf><Strd><CdtrRefInf><Ref>${r.ref}</Ref></CdtrRefInf></Strd></RmtInf></TxDtls></NtryDtls></Ntry>`,
  )
  .join('\n')}
</Stmt></BkToCstmrStmt></Document>`;

  it('matches a camt.053 file to open deposits and marks only confirmed, exact lines as paid', async () => {
    const { trustee, auction } = await publishedAuction();
    const exactBidder = await readyBidder(person({ fullName: 'Janez Novak' }));
    const wrongAmountBidder = await readyBidder(person({ fullName: 'Peter Kralj' }));
    const otherNameBidder = await readyBidder(company());
    const unpaidBidder = await readyBidder(person({ fullName: 'Ana Zupan' }));
    const [exact, wrongAmount, otherName, unpaid] = await Promise.all(
      [exactBidder, wrongAmountBidder, otherNameBidder, unpaidBidder].map((b) =>
        registrationService.registerForAuction(h.ctx, b, auction.id),
      ),
    );

    const xml = camt([
      {
        ref: exact!.paymentReference.replace(' ', ''),
        amount: '10000.00',
        payer: 'NOVAK JANEZ',
        id: 'T1',
      },
      { ref: wrongAmount!.paymentReference, amount: '9000.00', payer: 'Peter Kralj', id: 'T2' },
      {
        ref: otherName!.paymentReference,
        amount: '10000.00',
        payer: 'Tretja oseba s.p.',
        id: 'T3',
      },
      { ref: 'SI00 999999-1', amount: '10000.00', payer: 'Nekdo', id: 'T4' },
    ]);

    const proposal = await registrationService.proposeDepositMatches(h.ctx, trustee, xml);
    expect(proposal.transactionCount).toBe(4);
    const byReg = new Map(proposal.matches.map((m) => [m.registrationId, m]));
    expect(byReg.get(exact!.id)).toMatchObject({
      confidence: 'EXACT',
      bidderName: 'Janez Novak',
      depositCents: 1_000_000n,
    });
    expect(byReg.get(wrongAmount!.id)?.confidence).toBe('AMOUNT_MISMATCH');
    expect(byReg.get(otherName!.id)).toMatchObject({
      confidence: 'NAME_MISMATCH',
      bidderName: 'Nepremičnine Kovač d.o.o.',
    });
    expect(byReg.has(unpaid!.id)).toBe(false);
    expect(proposal.unmatched.map((t) => t.bankReference)).toEqual(['T4']);

    // Another trustee's import sees none of these deposits.
    expect(
      (await registrationService.proposeDepositMatches(h.ctx, await h.trustee(), xml)).matches,
    ).toEqual([]);

    // The trustee confirms all three proposals; the server refuses the wrong amount.
    const result = await registrationService.confirmDepositMatches(h.ctx, trustee, {
      matches: proposal.matches.map((m) => ({
        registrationId: m.registrationId,
        amountCents: m.transaction.amountCents,
        payerName: m.transaction.payerName,
        bookingDate: m.transaction.bookingDate,
        bankReference: m.transaction.bankReference,
      })),
    });
    expect(result.confirmed.sort()).toEqual([exact!.id, otherName!.id].sort());
    expect(result.skipped).toEqual([
      {
        registrationId: wrongAmount!.id,
        reason: 'Znesek plačila (9.000,00 €) ni enak varščini (10.000,00 €).',
      },
    ]);

    const after = await registrationService.listAuctionRegistrations(h.ctx, trustee, auction.id);
    const status = new Map(after.map((r) => [r.registration.id, r.registration]));
    expect(status.get(exact!.id)).toMatchObject({
      depositStatus: 'PAID',
      depositNote: 'Bančni izpisek, 2030-01-05: NOVAK JANEZ (T1)',
    });
    expect(status.get(wrongAmount!.id)?.depositStatus).toBe('PENDING');
    expect(status.get(unpaid!.id)?.depositStatus).toBe('PENDING');

    // Importing the same file again proposes nothing new for already-paid deposits.
    const again = await registrationService.proposeDepositMatches(h.ctx, trustee, xml);
    expect(again.matches.map((m) => m.registrationId)).toEqual([wrongAmount!.id]);
  });

  it("cannot be used to mark another trustee's deposits", async () => {
    const { auction } = await publishedAuction();
    const reg = await registrationService.registerForAuction(
      h.ctx,
      await readyBidder(),
      auction.id,
    );
    const result = await registrationService.confirmDepositMatches(h.ctx, await h.trustee(), {
      matches: [
        {
          registrationId: reg.id,
          amountCents: 1_000_000n,
          payerName: 'x',
          bookingDate: null,
          bankReference: null,
        },
      ],
    });
    expect(result).toEqual({
      confirmed: [],
      skipped: [{ registrationId: reg.id, reason: 'Prijava ne obstaja.' }],
    });
  });
});
