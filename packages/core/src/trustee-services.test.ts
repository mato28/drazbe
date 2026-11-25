import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { auctionService, caseService, documentService, lotService } from './index';
import { AGRICULTURAL_NOT_SUPPORTED } from './auctions/service';
import {
  ascendingInput,
  caseInput,
  createHarness,
  descendingInput,
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

async function caseWithLot(
  actor = undefined as Awaited<ReturnType<Harness['trustee']>> | undefined,
) {
  const trustee = actor ?? (await h.trustee());
  const c = await caseService.createCase(h.ctx, trustee, caseInput());
  const lot = await lotService.createLot(h.ctx, trustee, c.id, lotInput());
  return { trustee, case: c, lot };
}

describe('insolvency cases', () => {
  it('creates a case with a normalized IBAN and tax id, and writes the audit log', async () => {
    const trustee = await h.trustee();
    const c = await caseService.createCase(
      h.ctx,
      trustee,
      caseInput({ estateIban: 'si56 0510 0801 2340 041', debtorTaxId: 'SI 12345679' }),
    );
    expect(c.estateIban).toBe('SI56051008012340041');
    expect(c.debtorTaxId).toBe('12345679');

    const audit = await h.ctx.uow.repos.auditLog.listForEntity('insolvency_case', c.id);
    expect(audit.map((a) => a.action)).toEqual(['case.created']);
    expect(audit[0]?.actorId).toBe(trustee.userId);
    expect(audit[0]?.at.toISOString()).toBe(NOW.toISOString());
  });

  it('rejects an invalid IBAN and tax id with Slovenian field messages', async () => {
    const e = await domainError(
      caseService.createCase(
        h.ctx,
        await h.trustee(),
        caseInput({ estateIban: 'SI56 0510 0801 2340 042', debtorTaxId: '12345678' }),
      ),
    );
    expect(e.code).toBe('VALIDATION');
    expect(e.fields?.estateIban).toMatch(/^IBAN ni veljaven/);
    expect(e.fields?.debtorTaxId).toMatch(/^Davčna številka ni veljavna/);
  });

  it('rejects a duplicate court + case number', async () => {
    const trustee = await h.trustee();
    const input = caseInput();
    await caseService.createCase(h.ctx, trustee, input);
    const e = await domainError(caseService.createCase(h.ctx, trustee, input));
    expect(e.code).toBe('CONFLICT');
    expect(e.fields).toHaveProperty('caseNumber');
  });

  it('shows a trustee only their own cases', async () => {
    const a = await caseWithLot();
    const b = await caseWithLot();

    expect((await caseService.listCases(h.ctx, a.trustee)).map((c) => c.id)).toEqual([a.case.id]);
    expect((await caseService.listCases(h.ctx, b.trustee)).map((c) => c.id)).toEqual([b.case.id]);

    const e = await domainError(caseService.getCase(h.ctx, b.trustee, a.case.id));
    expect(e.code).toBe('NOT_FOUND');
    expect(
      (await domainError(caseService.updateCase(h.ctx, b.trustee, a.case.id, caseInput()))).code,
    ).toBe('NOT_FOUND');
  });

  it('refuses non-trustees', async () => {
    const e = await domainError(caseService.createCase(h.ctx, await h.bidder(), caseInput()));
    expect(e.code).toBe('FORBIDDEN');
  });

  it('updates a case and records before/after', async () => {
    const { trustee, case: c } = await caseWithLot();
    const updated = await caseService.updateCase(
      h.ctx,
      trustee,
      c.id,
      caseInput({ caseNumber: c.caseNumber, estateBank: 'Druga banka d.d.' }),
    );
    expect(updated.estateBank).toBe('Druga banka d.d.');
    const audit = await h.ctx.uow.repos.auditLog.listForEntity('insolvency_case', c.id);
    expect(audit.at(-1)).toMatchObject({
      action: 'case.updated',
      before: { estateBank: 'Primer banka d.d.' },
      after: { estateBank: 'Druga banka d.d.' },
    });
  });
});

describe('lots', () => {
  it('creates and updates a lot with exact cents', async () => {
    const { trustee, lot } = await caseWithLot();
    expect(lot.appraisalValueCents).toBe(18_500_000n);
    const updated = await lotService.updateLot(
      h.ctx,
      trustee,
      lot.id,
      lotInput({ title: 'Trisobno stanovanje', appraisalValueCents: 19_999_999n }),
    );
    expect(updated.title).toBe('Trisobno stanovanje');
    expect(updated.appraisalValueCents).toBe(19_999_999n);

    const audit = await h.ctx.uow.repos.auditLog.listForEntity('lot', lot.id);
    expect(audit.map((a) => a.action)).toEqual(['lot.created', 'lot.updated']);
    // bigint is stored as an exact decimal string in the audit JSON
    expect(audit[1]?.after).toMatchObject({ appraisalValueCents: '19999999' });
  });

  it("cannot be created in or read from another trustee's case", async () => {
    const a = await caseWithLot();
    const other = await h.trustee();
    expect(
      (await domainError(lotService.createLot(h.ctx, other, a.case.id, lotInput()))).code,
    ).toBe('NOT_FOUND');
    expect((await domainError(lotService.getLot(h.ctx, other, a.lot.id))).code).toBe('NOT_FOUND');
    expect((await domainError(lotService.updateLot(h.ctx, other, a.lot.id, lotInput()))).code).toBe(
      'NOT_FOUND',
    );
  });
});

describe('lot documents', () => {
  it('stores the file and the server-computed sha256', async () => {
    const { trustee, lot } = await caseWithLot();
    const doc = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'LAND_REGISTRY_EXTRACT',
      filename: '../izpisek "ZK".pdf',
      bytes: PDF_BYTES,
    });

    expect(doc.sha256).toBe(createHash('sha256').update(PDF_BYTES).digest('hex'));
    expect(doc.sizeBytes).toBe(PDF_BYTES.byteLength);
    expect(doc.mime).toBe('application/pdf');
    expect(doc.filename).toBe('izpisek ZK.pdf');
    expect(doc.s3Key).toMatch(new RegExp(`^lots/${lot.id}/[0-9a-f-]{36}\\.pdf$`));
    expect(h.storage.objects.get(doc.s3Key)?.body).toEqual(PDF_BYTES);

    const details = await lotService.getLot(h.ctx, trustee, lot.id);
    expect(details.documents.map((d) => d.id)).toEqual([doc.id]);
    const audit = await h.ctx.uow.repos.auditLog.listForEntity('document', doc.id);
    expect(audit[0]).toMatchObject({ action: 'document.uploaded', after: { sha256: doc.sha256 } });
  });

  it('rejects files that are not PDF/JPG/PNG/WEBP, whatever their name says', async () => {
    const { trustee, lot } = await caseWithLot();
    const e = await domainError(
      documentService.uploadLotDocument(h.ctx, trustee, {
        lotId: lot.id,
        kind: 'OTHER',
        filename: 'cenitev.pdf',
        bytes: new TextEncoder().encode('MZ this is an executable'),
      }),
    );
    expect(e.fields?.file).toBe('Dovoljene so samo datoteke PDF, JPG, PNG in WEBP.');
    expect((await lotService.getLot(h.ctx, trustee, lot.id)).documents).toHaveLength(0);
  });

  it('requires photos to be images and rejects empty files', async () => {
    const { trustee, lot } = await caseWithLot();
    const base = { lotId: lot.id, filename: 'x' };
    expect(
      (
        await domainError(
          documentService.uploadLotDocument(h.ctx, trustee, {
            ...base,
            kind: 'PHOTO',
            bytes: PDF_BYTES,
          }),
        )
      ).fields?.file,
    ).toBe('Fotografija mora biti slika (JPG, PNG ali WEBP).');
    expect(
      (
        await domainError(
          documentService.uploadLotDocument(h.ctx, trustee, {
            ...base,
            kind: 'PHOTO',
            bytes: new Uint8Array(),
          }),
        )
      ).fields?.file,
    ).toBe('Datoteka je prazna.');
    const photo = await documentService.uploadLotDocument(h.ctx, trustee, {
      ...base,
      kind: 'PHOTO',
      bytes: PNG_BYTES,
    });
    expect(photo.mime).toBe('image/png');
  });

  it('deletes a document, removes the object and keeps the hash in the audit log', async () => {
    const { trustee, lot } = await caseWithLot();
    const doc = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'APPRAISAL_REPORT',
      filename: 'cenitev.pdf',
      bytes: PDF_BYTES,
    });
    await documentService.deleteLotDocument(h.ctx, trustee, doc.id);

    expect(h.storage.objects.has(doc.s3Key)).toBe(false);
    expect(await h.ctx.uow.repos.documents.findById(doc.id)).toBeUndefined();
    const audit = await h.ctx.uow.repos.auditLog.listForEntity('document', doc.id);
    expect(audit.at(-1)).toMatchObject({
      action: 'document.deleted',
      before: { sha256: doc.sha256 },
    });
  });

  it("hides another trustee's documents", async () => {
    const { trustee, lot } = await caseWithLot();
    const doc = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'OTHER',
      filename: 'a.pdf',
      bytes: PDF_BYTES,
    });
    const other = await h.trustee();
    expect(
      (await domainError(documentService.getDocumentDownloadUrl(h.ctx, other, doc.id))).code,
    ).toBe('NOT_FOUND');
    expect((await domainError(documentService.deleteLotDocument(h.ctx, other, doc.id))).code).toBe(
      'NOT_FOUND',
    );
    expect(
      (
        await domainError(
          documentService.uploadLotDocument(h.ctx, other, {
            lotId: lot.id,
            kind: 'OTHER',
            filename: 'a.pdf',
            bytes: PDF_BYTES,
          }),
        )
      ).code,
    ).toBe('NOT_FOUND');
    expect(await documentService.getDocumentDownloadUrl(h.ctx, trustee, doc.id)).toBe(
      `memory://${doc.s3Key}`,
    );
  });
});

describe('auctions — create and edit', () => {
  it('creates an ascending draft and clears descending-only fields', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(
      h.ctx,
      trustee,
      lot.id,
      ascendingInput({ floorPriceCents: 1n, priceDecrementCents: 1n, stepDurationSec: 99 }),
    );
    expect(a).toMatchObject({
      status: 'DRAFT',
      type: 'ASCENDING',
      startingPriceCents: 10_000_000n,
      floorPriceCents: null,
      priceDecrementCents: null,
      stepDurationSec: null,
      extensionWindowSec: 120,
      extensionSec: 120,
      preemptionWindowSec: 600,
    });
  });

  it('fills an empty deposit and registration deadline with the defaults', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(
      h.ctx,
      trustee,
      lot.id,
      // Starts Monday 2030-01-14 -> deadline Thursday 2030-01-10, same local time.
      ascendingInput({
        startsAt: new Date('2030-01-14T09:00:00Z'),
        endsAt: new Date('2030-01-14T10:00:00Z'),
        registrationDeadline: null,
        depositCents: null,
      }),
    );
    expect(a.depositCents).toBe(1_000_000n); // 10 % of 100.000,00 €
    expect(a.registrationDeadline.toISOString()).toBe('2030-01-10T09:00:00.000Z');
  });

  it('creates a descending draft', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, descendingInput());
    expect(a).toMatchObject({ type: 'DESCENDING', floorPriceCents: 7_000_000n, endsAt: null });
  });

  it('rejects an invalid config with Slovenian messages per field', async () => {
    const { trustee, lot } = await caseWithLot();
    const e = await domainError(
      auctionService.createAuction(
        h.ctx,
        trustee,
        lot.id,
        descendingInput({
          floorPriceCents: 10_000_001n,
          priceDecrementCents: 0n,
          registrationDeadline: new Date('2030-01-10T09:00:00Z'),
        }),
      ),
    );
    expect(e.code).toBe('VALIDATION');
    expect(e.fields).toEqual({
      floorPriceCents: 'Najnižja cena ne sme presegati izklicne cene.',
      priceDecrementCents: 'Korak zniževanja mora biti večji od 0.',
      registrationDeadline: 'Rok za prijavo mora biti pred začetkom dražbe.',
    });
  });

  it('allows only one open auction per lot', async () => {
    const { trustee, lot } = await caseWithLot();
    await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    const e = await domainError(
      auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput()),
    );
    expect(e.code).toBe('CONFLICT');
    expect(e.message).toMatch(/že obstaja odprta dražba/);
  });

  it('edits only drafts', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    const edited = await auctionService.updateAuction(
      h.ctx,
      trustee,
      a.id,
      ascendingInput({ startingPriceCents: 9_000_000n, depositCents: 900_000n }),
    );
    expect(edited.startingPriceCents).toBe(9_000_000n);

    await auctionService.publishAuction(h.ctx, trustee, a.id);
    const e = await domainError(
      auctionService.updateAuction(h.ctx, trustee, a.id, ascendingInput()),
    );
    expect(e).toMatchObject({
      code: 'CONFLICT',
      message: 'Spreminjati je mogoče samo dražbo v stanju osnutka.',
    });
  });

  it("hides another trustee's auctions", async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    const other = await h.trustee();

    expect(await auctionService.listAuctions(h.ctx, other)).toEqual([]);
    expect((await auctionService.listAuctions(h.ctx, trustee)).map((x) => x.id)).toEqual([a.id]);
    for (const call of [
      () => auctionService.getAuction(h.ctx, other, a.id),
      () => auctionService.updateAuction(h.ctx, other, a.id, ascendingInput()),
      () => auctionService.publishAuction(h.ctx, other, a.id),
      () => auctionService.cancelAuction(h.ctx, other, a.id, 'Razlog za preklic.'),
      () => auctionService.createAuction(h.ctx, other, lot.id, ascendingInput()),
    ]) {
      expect((await domainError(call())).code).toBe('NOT_FOUND');
    }
  });
});

describe('auctions — lifecycle', () => {
  it('publishes a draft and writes the audit log', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    const published = await auctionService.publishAuction(h.ctx, trustee, a.id);

    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt?.toISOString()).toBe(NOW.toISOString());

    const { history } = await auctionService.getAuction(h.ctx, trustee, a.id);
    expect(history.map((x) => x.action)).toEqual(['auction.created', 'auction.published']);
    expect(history[1]).toMatchObject({
      actorId: trustee.userId,
      before: { status: 'DRAFT' },
      after: { status: 'PUBLISHED' },
    });

    const again = await domainError(auctionService.publishAuction(h.ctx, trustee, a.id));
    expect(again).toMatchObject({
      code: 'CONFLICT',
      message: 'Objaviti je mogoče samo dražbo v stanju osnutka.',
    });
  });

  it('blocks publishing for agricultural land with a clear message', async () => {
    const trustee = await h.trustee();
    const c = await caseService.createCase(h.ctx, trustee, caseInput());
    const lot = await lotService.createLot(
      h.ctx,
      trustee,
      c.id,
      lotInput({ isAgricultural: true }),
    );
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());

    const e = await domainError(auctionService.publishAuction(h.ctx, trustee, a.id));
    expect(e).toMatchObject({ code: 'CONFLICT', message: AGRICULTURAL_NOT_SUPPORTED });
    expect((await auctionService.getAuction(h.ctx, trustee, a.id)).auction.status).toBe('DRAFT');
  });

  it('requires the court approval reference to publish', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(
      h.ctx,
      trustee,
      lot.id,
      ascendingInput({ courtApprovalRef: null }),
    );
    const e = await domainError(auctionService.publishAuction(h.ctx, trustee, a.id));
    expect(e.code).toBe('VALIDATION');
    expect(e.fields?.courtApprovalRef).toMatch(/soglasju sodišča/);
  });

  it('re-validates timing at publish time (stale draft)', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    h.clock.set(new Date('2030-01-09T00:00:00Z')); // registration deadline has passed
    try {
      const e = await domainError(auctionService.publishAuction(h.ctx, trustee, a.id));
      expect(e.fields).toEqual({ registrationDeadline: 'Rok za prijavo mora biti v prihodnosti.' });
    } finally {
      h.clock.set(NOW);
    }
  });

  it('does not let an unverified trustee publish', async () => {
    const trustee = await h.trustee({ verified: false });
    const { lot } = await caseWithLot(trustee);
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    expect((await domainError(auctionService.publishAuction(h.ctx, trustee, a.id))).code).toBe(
      'FORBIDDEN',
    );
  });

  it('cancels a published auction with a reason, then allows a repeat auction', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());
    await auctionService.publishAuction(h.ctx, trustee, a.id);

    const cancelled = await auctionService.cancelAuction(
      h.ctx,
      trustee,
      a.id,
      'Sodišče je razveljavilo soglasje.',
    );
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      closedReason: 'Sodišče je razveljavilo soglasje.',
    });
    expect(cancelled.closedAt?.toISOString()).toBe(NOW.toISOString());

    const { history } = await auctionService.getAuction(h.ctx, trustee, a.id);
    expect(history.at(-1)?.action).toBe('auction.settled');
    expect(history.find((e) => e.action === 'auction.cancelled')).toMatchObject({
      action: 'auction.cancelled',
      before: { status: 'PUBLISHED' },
      after: { status: 'CANCELLED', reason: 'Sodišče je razveljavilo soglasje.' },
    });

    expect(
      (await domainError(auctionService.cancelAuction(h.ctx, trustee, a.id, 'Še enkrat preklic.')))
        .code,
    ).toBe('CONFLICT');
    const repeat = await auctionService.createAuction(h.ctx, trustee, lot.id, descendingInput());
    expect(repeat.status).toBe('DRAFT');
  });

  it('stops only a running auction, with a reason', async () => {
    const { trustee, lot } = await caseWithLot();
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, descendingInput());
    await auctionService.publishAuction(h.ctx, trustee, a.id);

    const notLive = await domainError(
      auctionService.stopAuction(h.ctx, trustee, a.id, 'Tehnična napaka.'),
    );
    expect(notLive).toMatchObject({
      code: 'CONFLICT',
      message: 'Ustaviti je mogoče samo dražbo, ki poteka.',
    });

    await h.ctx.uow.repos.auctions.update(a.id, { status: 'LIVE' }); // the worker clock will do this
    const cantCancel = await domainError(
      auctionService.cancelAuction(h.ctx, trustee, a.id, 'Preklic med dražbo.'),
    );
    expect(cantCancel.code).toBe('CONFLICT');

    const stopped = await auctionService.stopAuction(
      h.ctx,
      trustee,
      a.id,
      'Tehnična napaka pri dostopu.',
    );
    expect(stopped).toMatchObject({
      status: 'CANCELLED',
      closedReason: 'Tehnična napaka pri dostopu.',
    });
    const { history } = await auctionService.getAuction(h.ctx, trustee, a.id);
    expect(history.find((e) => e.action === 'auction.stopped')).toMatchObject({
      before: { status: 'LIVE' },
    });
  });

  it('freezes the lot, its documents and its case once an auction is published', async () => {
    const { trustee, lot, case: c } = await caseWithLot();
    const doc = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'OTHER',
      filename: 'a.pdf',
      bytes: PDF_BYTES,
    });
    const a = await auctionService.createAuction(h.ctx, trustee, lot.id, ascendingInput());

    // Still editable while the auction is a draft.
    await lotService.updateLot(h.ctx, trustee, lot.id, lotInput({ title: 'Popravljen naziv' }));
    await auctionService.publishAuction(h.ctx, trustee, a.id);

    expect((await lotService.getLot(h.ctx, trustee, lot.id)).locked).toBe(true);
    for (const call of [
      () => lotService.updateLot(h.ctx, trustee, lot.id, lotInput()),
      () => documentService.deleteLotDocument(h.ctx, trustee, doc.id),
      () =>
        documentService.uploadLotDocument(h.ctx, trustee, {
          lotId: lot.id,
          kind: 'OTHER',
          filename: 'b.pdf',
          bytes: PDF_BYTES,
        }),
      () => caseService.updateCase(h.ctx, trustee, c.id, caseInput({ caseNumber: c.caseNumber })),
    ]) {
      expect((await domainError(call())).code).toBe('CONFLICT');
    }
  });
});
