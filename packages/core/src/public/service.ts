import type { AuctionRow, DocumentRow } from '@domik/db';
import {
  type AuctionStatus,
  type AuctionType,
  type PropertyKind,
  PUBLIC_PAGE_SIZE,
  type PublicAuctionQuery,
  type PublicPhase,
} from '@domik/shared';
import { descendingSchedule } from '../auctions/config';
import { configOf } from '../auctions/service';
import { type ServiceContext } from '../context';
import { notFound } from '../errors';
import { auctionRulesSummary } from './rules';

/** Auctions shown in the public list: announced or running. */
export const LISTED_STATUSES: readonly AuctionStatus[] = [
  'PUBLISHED',
  'REGISTRATION_CLOSED',
  'LIVE',
  'PREEMPTION',
];

/**
 * Auctions whose detail page is public. Everything that was ever published stays reachable
 * (with its outcome), so people who saw the notice can find out what happened.
 * DRAFT is never public, and neither is an auction that was cancelled before being published
 * (the repository additionally requires `published_at`).
 */
export const PUBLIC_STATUSES: readonly AuctionStatus[] = [
  ...LISTED_STATUSES,
  'ENDED',
  'UNSUCCESSFUL',
  'CANCELLED',
];

/** What a visitor is told about where the auction stands. */
export function publicPhase(
  auction: Pick<AuctionRow, 'status' | 'registrationDeadline'>,
  now: Date,
): PublicPhase {
  switch (auction.status) {
    case 'PUBLISHED':
      return auction.registrationDeadline.getTime() > now.getTime()
        ? 'REGISTRATION_OPEN'
        : 'REGISTRATION_CLOSED';
    case 'REGISTRATION_CLOSED':
      return 'REGISTRATION_CLOSED';
    case 'LIVE':
    case 'PREEMPTION':
      return 'LIVE';
    case 'ENDED':
      return 'ENDED';
    case 'UNSUCCESSFUL':
      return 'UNSUCCESSFUL';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'DRAFT':
      throw new Error('A draft auction has no public phase');
  }
}

export interface PublicDocument {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}

/** Card in the public list. Only whitelisted fields — never spread a DB row into this. */
export interface PublicAuctionSummary {
  id: string;
  type: AuctionType;
  phase: PublicPhase;
  title: string;
  propertyKind: PropertyKind;
  municipality: string | null;
  areaM2: string | null;
  startingPriceCents: bigint;
  startsAt: Date;
  registrationDeadline: Date;
  coverPhotoId: string | null;
}

export interface PublicAuctionDetail extends PublicAuctionSummary {
  depositCents: bigint;
  bidIncrementCents: bigint | null;
  priceDecrementCents: bigint | null;
  floorPriceCents: bigint | null;
  stepDurationSec: number | null;
  /** Scheduled end: fixed for ASCENDING, last price step for DESCENDING. */
  endsAt: Date | null;
  preemptionEnabled: boolean;
  publishedAt: Date | null;
  courtApprovalRef: string | null;
  closedReason: string | null;
  closedAt: Date | null;
  rules: string[];
  lot: {
    description: string | null;
    address: string | null;
    cadastralMunicipality: string | null;
    parcelNumber: string | null;
    buildingId: string | null;
    partId: string | null;
    idZnak: string | null;
    encumbrancesText: string | null;
    appraisalValueCents: bigint | null;
    landUse: string | null;
  };
  case: { court: string; caseNumber: string; debtorName: string };
  trustee: { name: string; firmName: string | null };
  photos: PublicDocument[];
  documents: PublicDocument[];
  /** The anonymised auction report (zapisnik), once the auction is over. */
  report: PublicDocument | null;
}

const toPublicDocument = (d: DocumentRow): PublicDocument => ({
  id: d.id,
  kind: d.kind,
  filename: d.filename,
  mime: d.mime,
  sizeBytes: d.sizeBytes,
});

export interface PublicAuctionList {
  items: PublicAuctionSummary[];
  total: number;
  page: number;
  pageCount: number;
  /** Towns that have at least one listed auction (for the location filter). */
  municipalities: string[];
}

export async function listPublicAuctions(
  ctx: ServiceContext,
  query: PublicAuctionQuery,
  pageSize = PUBLIC_PAGE_SIZE,
): Promise<PublicAuctionList> {
  const repo = ctx.uow.repos.publicAuctions;
  const now = ctx.clock.now();
  const filter = {
    statuses: LISTED_STATUSES,
    now,
    phase: query.stanje,
    auctionType: query.nacin,
    propertyKind: query.vrsta,
    municipality: query.kraj,
    minPriceCents: query.cenaOd,
    maxPriceCents: query.cenaDo,
  };

  const [total, municipalities] = await Promise.all([
    repo.count(filter),
    repo.listMunicipalities(LISTED_STATUSES),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.stran, pageCount);
  const rows = await repo.list(filter, pageSize, (page - 1) * pageSize);

  const docs = await repo.listLotDocuments(rows.map((r) => r.lot.id));
  const coverByLot = new Map<string, string>();
  for (const d of docs) {
    if (d.kind === 'PHOTO' && !coverByLot.has(d.ownerId)) coverByLot.set(d.ownerId, d.id);
  }

  return {
    items: rows.map(({ auction, lot }) => ({
      id: auction.id,
      type: auction.type,
      phase: publicPhase(auction, now),
      title: lot.title,
      propertyKind: lot.propertyKind,
      municipality: lot.municipality,
      areaM2: lot.areaM2,
      startingPriceCents: auction.startingPriceCents,
      startsAt: auction.startsAt,
      registrationDeadline: auction.registrationDeadline,
      coverPhotoId: coverByLot.get(lot.id) ?? null,
    })),
    total,
    page,
    pageCount,
    municipalities,
  };
}

// LEGAL-REVIEW: mandatory / forbidden content of the public notice — see docs/legal-review.md
/** Public detail of an auction. Drafts (and unknown ids) are "not found". */
export async function getPublicAuction(
  ctx: ServiceContext,
  auctionId: string,
): Promise<PublicAuctionDetail> {
  const repo = ctx.uow.repos.publicAuctions;
  const row = await repo.findById(auctionId, PUBLIC_STATUSES);
  if (!row) throw notFound('Dražba');
  const { auction, lot, case: insolvencyCase, trustee } = row;

  const docs = await repo.listLotDocuments([lot.id]);
  const photos = docs.filter((d) => d.kind === 'PHOTO');
  const config = configOf(auction);
  const report = (await ctx.uow.repos.documents.listByOwner('AUCTION', auction.id)).find(
    (d) => d.kind === 'AUCTION_REPORT_PUBLIC',
  );

  return {
    id: auction.id,
    type: auction.type,
    phase: publicPhase(auction, ctx.clock.now()),
    title: lot.title,
    propertyKind: lot.propertyKind,
    municipality: lot.municipality,
    areaM2: lot.areaM2,
    startingPriceCents: auction.startingPriceCents,
    startsAt: auction.startsAt,
    registrationDeadline: auction.registrationDeadline,
    coverPhotoId: photos[0]?.id ?? null,
    depositCents: auction.depositCents,
    bidIncrementCents: auction.bidIncrementCents,
    priceDecrementCents: auction.priceDecrementCents,
    floorPriceCents: auction.floorPriceCents,
    stepDurationSec: auction.stepDurationSec,
    endsAt: auction.endsAt ?? descendingSchedule(config)?.endsAt ?? null,
    preemptionEnabled: auction.preemptionEnabled,
    publishedAt: auction.publishedAt,
    courtApprovalRef: auction.courtApprovalRef,
    closedReason: auction.closedReason,
    closedAt: auction.closedAt,
    rules: auctionRulesSummary(config),
    lot: {
      description: lot.description,
      address: lot.address,
      cadastralMunicipality: lot.cadastralMunicipality,
      parcelNumber: lot.parcelNumber,
      buildingId: lot.buildingId,
      partId: lot.partId,
      idZnak: lot.idZnak,
      encumbrancesText: lot.encumbrancesText,
      appraisalValueCents: lot.appraisalValueCents,
      landUse: lot.landUse,
    },
    // Deliberately no estate IBAN, tax ids or internal ids here.
    case: {
      court: insolvencyCase.court,
      caseNumber: insolvencyCase.caseNumber,
      debtorName: insolvencyCase.debtorName,
    },
    trustee: { name: trustee.name, firmName: trustee.firmName },
    photos: photos.map(toPublicDocument),
    documents: docs.filter((d) => d.kind !== 'PHOTO').map(toPublicDocument),
    report: report ? toPublicDocument(report) : null,
  };
}

/** Ids of all publicly reachable auctions with their last change (for the sitemap). */
export async function listPublicAuctionIds(
  ctx: ServiceContext,
): Promise<{ id: string; updatedAt: Date }[]> {
  const rows = await ctx.uow.repos.publicAuctions.list(
    { statuses: PUBLIC_STATUSES, now: ctx.clock.now() },
    5000,
    0,
  );
  return rows.map((r) => ({ id: r.auction.id, updatedAt: r.auction.updatedAt }));
}

// LEGAL-REVIEW: which lot documents may be public, and redaction — see docs/legal-review.md
/**
 * Download URL for a lot document — only if the lot has an auction that is (or was) published.
 * Documents of lots with only draft auctions are not public.
 */
export async function getPublicDocumentDownloadUrl(
  ctx: ServiceContext,
  documentId: string,
): Promise<string> {
  const { repos } = ctx.uow;
  const doc = await repos.documents.findById(documentId);
  // LEGAL-REVIEW: publishing the anonymised auction report — see docs/legal-review.md
  const publicReport =
    doc?.ownerType === 'AUCTION' &&
    doc.kind === 'AUCTION_REPORT_PUBLIC' &&
    (await repos.publicAuctions.findById(doc.ownerId, PUBLIC_STATUSES)) !== undefined;
  if (!doc || (!publicReport && doc.ownerType !== 'LOT')) throw notFound('Dokument');
  if (
    doc.ownerType === 'LOT' &&
    !(await repos.publicAuctions.lotHasAuctionIn(doc.ownerId, PUBLIC_STATUSES))
  ) {
    throw notFound('Dokument');
  }
  return ctx.storage.getDownloadUrl(doc.s3Key, {
    filename: doc.filename,
    contentType: doc.mime,
    inline: true,
    expiresInSec: 300,
  });
}
