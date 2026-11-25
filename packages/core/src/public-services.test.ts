import { randomUUID } from 'node:crypto';
import { type PublicAuctionQuery } from '@domik/shared';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { auctionService, caseService, documentService, lotService, publicService } from './index';
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

const q = (over: Partial<PublicAuctionQuery> = {}): PublicAuctionQuery => ({ stran: 1, ...over });

/** A town name unique to one test, so tests sharing the database do not see each other's rows. */
const town = () => `Kraj-${randomUUID().slice(0, 8)}`;

async function setup(kraj: string, lotOver = {}, auctionOver = ascendingInput()) {
  const trustee = await h.trustee();
  const c = await caseService.createCase(h.ctx, trustee, caseInput());
  const lot = await lotService.createLot(
    h.ctx,
    trustee,
    c.id,
    lotInput({ municipality: kraj, ...lotOver }),
  );
  const auction = await auctionService.createAuction(h.ctx, trustee, lot.id, auctionOver);
  return { trustee, case: c, lot, auction };
}

describe('public visibility', () => {
  it('does not show drafts anywhere: list, detail or documents', async () => {
    const kraj = town();
    const { trustee, lot, auction } = await setup(kraj);
    const doc = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'APPRAISAL_REPORT',
      filename: 'cenitev.pdf',
      bytes: PDF_BYTES,
    });

    const list = await publicService.listPublicAuctions(h.ctx, q({ kraj }));
    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);
    expect(list.municipalities).not.toContain(kraj);
    expect((await domainError(publicService.getPublicAuction(h.ctx, auction.id))).code).toBe(
      'NOT_FOUND',
    );
    expect(
      (await domainError(publicService.getPublicDocumentDownloadUrl(h.ctx, doc.id))).code,
    ).toBe('NOT_FOUND');
    expect((await publicService.listPublicAuctionIds(h.ctx)).map((a) => a.id)).not.toContain(
      auction.id,
    );
  });

  it('shows a published auction with all public information', async () => {
    const kraj = town();
    const { trustee, lot, auction, case: c } = await setup(kraj);
    const photo = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'PHOTO',
      filename: 'dnevna-soba.png',
      bytes: PNG_BYTES,
    });
    const appraisal = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'APPRAISAL_REPORT',
      filename: 'cenitev.pdf',
      bytes: PDF_BYTES,
    });
    await auctionService.publishAuction(h.ctx, trustee, auction.id);

    const list = await publicService.listPublicAuctions(h.ctx, q({ kraj }));
    expect(list.total).toBe(1);
    expect(list.municipalities).toContain(kraj);
    expect(list.items[0]).toMatchObject({
      id: auction.id,
      title: 'Dvosobno stanovanje',
      phase: 'REGISTRATION_OPEN',
      propertyKind: 'APARTMENT',
      municipality: kraj,
      startingPriceCents: 10_000_000n,
      coverPhotoId: photo.id,
    });

    const d = await publicService.getPublicAuction(h.ctx, auction.id);
    expect(d).toMatchObject({
      phase: 'REGISTRATION_OPEN',
      type: 'ASCENDING',
      startingPriceCents: 10_000_000n,
      depositCents: 1_000_000n,
      bidIncrementCents: 100_000n,
      case: { court: c.court, caseNumber: c.caseNumber, debtorName: c.debtorName },
      trustee: { name: 'Test Upravitelj' },
      lot: { idZnak: '1736-678-12', appraisalValueCents: 18_500_000n },
    });
    expect(d.startsAt.toISOString()).toBe('2030-01-10T09:00:00.000Z');
    expect(d.endsAt?.toISOString()).toBe('2030-01-10T10:00:00.000Z');
    expect(d.registrationDeadline.toISOString()).toBe('2030-01-08T09:00:00.000Z');
    expect(d.publishedAt?.toISOString()).toBe(NOW.toISOString());
    expect(d.photos.map((p) => p.id)).toEqual([photo.id]);
    expect(d.documents.map((x) => x.id)).toEqual([appraisal.id]);
    expect(d.rules.length).toBeGreaterThan(3);

    expect(await publicService.getPublicDocumentDownloadUrl(h.ctx, appraisal.id)).toBe(
      `memory://${appraisal.s3Key}`,
    );
    expect((await publicService.listPublicAuctionIds(h.ctx)).map((a) => a.id)).toContain(
      auction.id,
    );
  });

  it('never exposes the estate IBAN, tax ids or storage keys', async () => {
    const kraj = town();
    const { trustee, auction, case: c, lot } = await setup(kraj);
    const doc = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'OTHER',
      filename: 'a.pdf',
      bytes: PDF_BYTES,
    });
    await auctionService.publishAuction(h.ctx, trustee, auction.id);

    const json = JSON.stringify(
      [
        await publicService.getPublicAuction(h.ctx, auction.id),
        await publicService.listPublicAuctions(h.ctx, q({ kraj })),
      ],
      (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
    );
    expect(json).not.toContain(c.estateIban);
    expect(json).not.toContain(c.debtorTaxId);
    expect(json).not.toContain(doc.s3Key);
    expect(json).not.toContain(doc.sha256);
    expect(json).not.toContain(trustee.userId);
  });

  it('keeps a cancelled auction reachable with its reason, but off the list', async () => {
    const kraj = town();
    const { trustee, auction } = await setup(kraj);
    await auctionService.publishAuction(h.ctx, trustee, auction.id);
    await auctionService.cancelAuction(
      h.ctx,
      trustee,
      auction.id,
      'Sodišče je razveljavilo soglasje.',
    );

    expect((await publicService.listPublicAuctions(h.ctx, q({ kraj }))).items).toEqual([]);
    const d = await publicService.getPublicAuction(h.ctx, auction.id);
    expect(d).toMatchObject({
      phase: 'CANCELLED',
      closedReason: 'Sodišče je razveljavilo soglasje.',
    });
  });

  it('keeps a draft that was cancelled without ever being published private', async () => {
    const kraj = town();
    const { trustee, lot, auction } = await setup(kraj);
    const doc = await documentService.uploadLotDocument(h.ctx, trustee, {
      lotId: lot.id,
      kind: 'OTHER',
      filename: 'a.pdf',
      bytes: PDF_BYTES,
    });
    await auctionService.cancelAuction(h.ctx, trustee, auction.id, 'Napačno vneseni podatki.');

    expect((await domainError(publicService.getPublicAuction(h.ctx, auction.id))).code).toBe(
      'NOT_FOUND',
    );
    expect(
      (await domainError(publicService.getPublicDocumentDownloadUrl(h.ctx, doc.id))).code,
    ).toBe('NOT_FOUND');
    expect((await publicService.listPublicAuctionIds(h.ctx)).map((a) => a.id)).not.toContain(
      auction.id,
    );
  });
});

describe('public phase', () => {
  it('follows the registration deadline and the status', async () => {
    const kraj = town();
    const { trustee, auction } = await setup(kraj);
    await auctionService.publishAuction(h.ctx, trustee, auction.id);

    try {
      h.clock.set(new Date('2030-01-08T09:00:00Z')); // deadline reached
      expect((await publicService.getPublicAuction(h.ctx, auction.id)).phase).toBe(
        'REGISTRATION_CLOSED',
      );
      expect(
        (await publicService.listPublicAuctions(h.ctx, q({ kraj, stanje: 'REGISTRATION_OPEN' })))
          .total,
      ).toBe(0);
      expect(
        (await publicService.listPublicAuctions(h.ctx, q({ kraj, stanje: 'REGISTRATION_CLOSED' })))
          .total,
      ).toBe(1);

      await h.ctx.uow.repos.auctions.update(auction.id, { status: 'LIVE' });
      expect((await publicService.getPublicAuction(h.ctx, auction.id)).phase).toBe('LIVE');
      expect(
        (await publicService.listPublicAuctions(h.ctx, q({ kraj, stanje: 'LIVE' }))).total,
      ).toBe(1);
      expect(
        (await publicService.listPublicAuctions(h.ctx, q({ kraj, stanje: 'REGISTRATION_CLOSED' })))
          .total,
      ).toBe(0);
    } finally {
      h.clock.set(NOW);
    }
  });

  it('computes the scheduled end of a descending auction', async () => {
    const { trustee, auction } = await setup(town(), {}, descendingInput());
    await auctionService.publishAuction(h.ctx, trustee, auction.id);
    const d = await publicService.getPublicAuction(h.ctx, auction.id);
    expect(d.endsAt?.toISOString()).toBe('2030-01-10T09:07:00.000Z');
    expect(d.floorPriceCents).toBe(7_000_000n);
  });
});

describe('public list filters', () => {
  it('filters by property kind, auction type and price, and paginates', async () => {
    const kraj = town();
    const make = async (lotOver: object, input: ReturnType<typeof ascendingInput>) => {
      const s = await setup(kraj, lotOver, input);
      await auctionService.publishAuction(h.ctx, s.trustee, s.auction.id);
      return s.auction.id;
    };
    const flat = await make(
      { propertyKind: 'APARTMENT' },
      ascendingInput({ startingPriceCents: 10_000_000n, depositCents: 1_000_000n }),
    );
    const land = await make(
      { propertyKind: 'LAND' },
      descendingInput({
        startingPriceCents: 30_000_000n,
        floorPriceCents: 20_000_000n,
        startsAt: new Date('2030-01-11T09:00:00Z'),
      }),
    );
    const office = await make(
      { propertyKind: 'COMMERCIAL' },
      ascendingInput({
        startingPriceCents: 50_000_000n,
        depositCents: 5_000_000n,
        startsAt: new Date('2030-01-12T09:00:00Z'),
        endsAt: new Date('2030-01-12T10:00:00Z'),
      }),
    );

    const ids = async (over: Partial<PublicAuctionQuery>) =>
      (await publicService.listPublicAuctions(h.ctx, q({ kraj, ...over }))).items.map((i) => i.id);

    expect(await ids({})).toEqual([flat, land, office]); // ordered by start
    expect(await ids({ vrsta: 'LAND' })).toEqual([land]);
    expect(await ids({ nacin: 'DESCENDING' })).toEqual([land]);
    expect(await ids({ cenaOd: 20_000_000n })).toEqual([land, office]);
    expect(await ids({ cenaDo: 30_000_000n })).toEqual([flat, land]);
    expect(await ids({ cenaOd: 20_000_000n, cenaDo: 40_000_000n })).toEqual([land]);
    expect(await ids({ vrsta: 'HOUSE' })).toEqual([]);

    const page1 = await publicService.listPublicAuctions(h.ctx, q({ kraj }), 2);
    expect(page1).toMatchObject({ total: 3, page: 1, pageCount: 2 });
    expect(page1.items.map((i) => i.id)).toEqual([flat, land]);
    const page2 = await publicService.listPublicAuctions(h.ctx, q({ kraj, stran: 2 }), 2);
    expect(page2.items.map((i) => i.id)).toEqual([office]);
    // A page past the end falls back to the last page instead of an empty one.
    expect((await publicService.listPublicAuctions(h.ctx, q({ kraj, stran: 99 }), 2)).page).toBe(2);
  });
});
