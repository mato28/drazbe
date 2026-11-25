import 'server-only';
import type { BidResult, LiveAuctionState } from '@domik/core';
import type {
  AuctionRegistrationRow,
  AuctionRow,
  BidderProfileRow,
  DocumentRow,
  InsolvencyCaseRow,
  LotRow,
  SaleRow,
} from '@domik/db';
import {
  type AuctionDto,
  auctionDtoSchema,
  type BidderProfileDto,
  bidderProfileDtoSchema,
  type RegistrationDto,
  registrationDtoSchema,
  type CaseDto,
  caseDtoSchema,
  type DocumentDto,
  documentDtoSchema,
  type LotDto,
  lotDtoSchema,
  type BidResultDto,
  bidResultDtoSchema,
  type LiveAuctionStateDto,
  liveAuctionStateDtoSchema,
  type SaleDto,
  saleDtoSchema,
} from '@domik/shared';

// Rows -> wire format. bigint cents become decimal strings, Dates become ISO strings.
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const str = (v: bigint | null): string | null => (v === null ? null : v.toString());

export function toCaseDto(row: InsolvencyCaseRow): CaseDto {
  return caseDtoSchema.parse({
    id: row.id,
    court: row.court,
    caseNumber: row.caseNumber,
    debtorName: row.debtorName,
    debtorTaxId: row.debtorTaxId,
    debtorAddress: row.debtorAddress,
    debtorCity: row.debtorCity,
    estateIban: row.estateIban,
    estateBank: row.estateBank,
    createdAt: row.createdAt.toISOString(),
  });
}

export function toLotDto(row: LotRow): LotDto {
  return lotDtoSchema.parse({
    id: row.id,
    caseId: row.caseId,
    type: row.type,
    title: row.title,
    propertyKind: row.propertyKind,
    municipality: row.municipality,
    description: row.description,
    cadastralMunicipality: row.cadastralMunicipality,
    parcelNumber: row.parcelNumber,
    buildingId: row.buildingId,
    partId: row.partId,
    idZnak: row.idZnak,
    areaM2: row.areaM2,
    address: row.address,
    encumbrancesText: row.encumbrancesText,
    appraisalValueCents: str(row.appraisalValueCents),
    landUse: row.landUse,
    isAgricultural: row.isAgricultural,
  });
}

export function toDocumentDto(row: DocumentRow): DocumentDto {
  return documentDtoSchema.parse({
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
  });
}

export function toAuctionDto(row: AuctionRow): AuctionDto {
  return auctionDtoSchema.parse({
    id: row.id,
    lotId: row.lotId,
    type: row.type,
    status: row.status,
    startingPriceCents: row.startingPriceCents.toString(),
    bidIncrementCents: str(row.bidIncrementCents),
    priceDecrementCents: str(row.priceDecrementCents),
    floorPriceCents: str(row.floorPriceCents),
    stepDurationSec: row.stepDurationSec,
    switchToAscendingOnAccept: row.switchToAscendingOnAccept,
    startsAt: row.startsAt.toISOString(),
    endsAt: iso(row.endsAt),
    extensionWindowSec: row.extensionWindowSec,
    extensionSec: row.extensionSec,
    registrationDeadline: row.registrationDeadline.toISOString(),
    depositCents: row.depositCents.toString(),
    preemptionEnabled: row.preemptionEnabled,
    preemptionWindowSec: row.preemptionWindowSec,
    courtApprovalRef: row.courtApprovalRef,
    publishedAt: iso(row.publishedAt),
    closedReason: row.closedReason,
    closedAt: iso(row.closedAt),
  });
}

export function toBidderProfileDto(row: BidderProfileRow, phone: string | null): BidderProfileDto {
  return bidderProfileDtoSchema.parse({
    id: row.id,
    type: row.type,
    fullName: row.fullName,
    taxId: row.taxId,
    address: row.address,
    phone,
    companyName: row.companyName,
    companyRegNo: row.companyRegNo,
    representativeName: row.representativeName,
    actsAsLegalRepresentative: row.actsAsLegalRepresentative,
    status: row.status,
    rejectionReason: row.rejectionReason,
  });
}

export function toRegistrationDto(
  row: AuctionRegistrationRow,
  identityStatus: BidderProfileRow['status'],
): RegistrationDto {
  return registrationDtoSchema.parse({
    id: row.id,
    auctionId: row.auctionId,
    seq: row.seq,
    pseudonym: row.pseudonym,
    paymentReference: row.paymentReference,
    status: row.status,
    depositStatus: row.depositStatus,
    identityStatus,
    statementUploaded: row.statementSignedDocId !== null,
    isPreemptionHolder: row.isPreemptionHolder,
    preemptionRank: row.preemptionRank,
    rejectionReason: row.rejectionReason,
  });
}

export function toLiveStateDto(s: LiveAuctionState): LiveAuctionStateDto {
  return liveAuctionStateDtoSchema.parse({
    ...s,
    serverTime: s.serverTime.toISOString(),
    startsAt: s.startsAt.toISOString(),
    endsAt: iso(s.endsAt),
    startingPriceCents: s.startingPriceCents.toString(),
    currentPriceCents: str(s.currentPriceCents),
    minimumBidCents: str(s.minimumBidCents),
    bidIncrementCents: str(s.bidIncrementCents),
    nextStepAt: iso(s.nextStepAt),
    nextPriceCents: str(s.nextPriceCents),
    floorPriceCents: str(s.floorPriceCents),
    preemptionEndsAt: iso(s.preemptionEndsAt),
    bids: s.bids.map((b) => ({
      ...b,
      amountCents: b.amountCents.toString(),
      serverTime: b.serverTime.toISOString(),
    })),
  });
}

export function toBidResultDto(r: BidResult): BidResultDto {
  return bidResultDtoSchema.parse({
    bid: {
      seq: r.bid.seq,
      pseudonym: r.bid.pseudonym,
      kind: r.bid.kind,
      amountCents: r.bid.amountCents.toString(),
      serverTime: r.bid.serverTime.toISOString(),
      hash: r.bid.hash,
    },
    duplicate: r.duplicate,
    auction: { ...r.auction, endsAt: iso(r.auction.endsAt) },
  });
}

export function toSaleDto(row: SaleRow): SaleDto {
  return saleDtoSchema.parse({
    id: row.id,
    auctionId: row.auctionId,
    status: row.status,
    priceCents: row.priceCents.toString(),
    depositAppliedCents: row.depositAppliedCents.toString(),
    downPaymentCents: row.downPaymentCents.toString(),
    downPaymentDays: row.downPaymentDays,
    priceDays: row.priceDays,
    contractDeadline: row.contractDeadline.toISOString(),
    downPaymentDeadline: row.downPaymentDeadline?.toISOString() ?? null,
    priceDeadline: row.priceDeadline?.toISOString() ?? null,
    contractSignedAt: row.contractSignedAt?.toISOString() ?? null,
    signedOnPaper: row.signedOnPaper,
    defaultReason: row.defaultReason,
  });
}
