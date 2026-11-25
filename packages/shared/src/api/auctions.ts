import { z } from 'zod';
import {
  centsString,
  isoInstant,
  optionalCentsString,
  optionalIsoInstant,
  optionalText,
  requiredText,
  seconds,
} from './common';

export const AUCTION_TYPES = ['ASCENDING', 'DESCENDING'] as const;
export const AUCTION_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_CLOSED',
  'LIVE',
  'PREEMPTION',
  'ENDED',
  'UNSUCCESSFUL',
  'CANCELLED',
] as const;
export type AuctionType = (typeof AUCTION_TYPES)[number];
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export const AUCTION_TYPE_LABEL: Record<AuctionType, string> = {
  ASCENDING: 'Dražba z zviševanjem izklicne cene',
  DESCENDING: 'Dražba z zniževanjem izklicne cene',
};

export const AUCTION_STATUS_LABEL: Record<AuctionStatus, string> = {
  DRAFT: 'Osnutek',
  PUBLISHED: 'Objavljena',
  REGISTRATION_CLOSED: 'Prijave zaključene',
  LIVE: 'V teku',
  PREEMPTION: 'Predkupna pravica',
  ENDED: 'Zaključena',
  UNSUCCESSFUL: 'Neuspešna',
  CANCELLED: 'Preklicana',
};

/** Defaults from CLAUDE.md ("Auction rules"). */
export const AUCTION_DEFAULTS = {
  extensionWindowSec: 120,
  extensionSec: 120,
  preemptionWindowSec: 600,
  stepDurationSec: 60,
  registrationDeadlineWorkingDays: 2,
  depositPercent: 10,
} as const;

/** Shape only — cross-field business rules live in @domik/core (validateAuctionConfig). */
export const auctionInputSchema = z.object({
  type: z.enum(AUCTION_TYPES, { error: 'Izberite vrsto dražbe.' }),
  startingPriceCents: centsString,
  bidIncrementCents: optionalCentsString,
  priceDecrementCents: optionalCentsString,
  floorPriceCents: optionalCentsString,
  stepDurationSec: seconds(1, 86_400)
    .nullish()
    .transform((v) => v ?? null),
  switchToAscendingOnAccept: z.boolean().default(false),
  startsAt: isoInstant,
  endsAt: optionalIsoInstant,
  extensionWindowSec: seconds(0, 3600).default(AUCTION_DEFAULTS.extensionWindowSec),
  extensionSec: seconds(0, 3600).default(AUCTION_DEFAULTS.extensionSec),
  /** Omitted/null = default: 2 working days before the start. */
  registrationDeadline: optionalIsoInstant,
  /** Omitted/null = default: 10 % of the starting price. */
  depositCents: optionalCentsString,
  preemptionEnabled: z.boolean().default(false),
  preemptionWindowSec: seconds(1, 86_400).default(AUCTION_DEFAULTS.preemptionWindowSec),
  courtApprovalRef: optionalText(300),
});
export type AuctionInput = z.infer<typeof auctionInputSchema>;
export type AuctionInputWire = z.input<typeof auctionInputSchema>;

export const auctionReasonSchema = z.object({
  reason: requiredText(2000).refine((v) => v.length >= 10, 'Navedite razlog (vsaj 10 znakov).'),
});
export type AuctionReasonInput = z.infer<typeof auctionReasonSchema>;

export const auctionDtoSchema = z.object({
  id: z.uuid(),
  lotId: z.uuid(),
  type: z.enum(AUCTION_TYPES),
  status: z.enum(AUCTION_STATUSES),
  startingPriceCents: z.string(),
  bidIncrementCents: z.string().nullable(),
  priceDecrementCents: z.string().nullable(),
  floorPriceCents: z.string().nullable(),
  stepDurationSec: z.number().nullable(),
  switchToAscendingOnAccept: z.boolean(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  extensionWindowSec: z.number(),
  extensionSec: z.number(),
  registrationDeadline: z.iso.datetime(),
  depositCents: z.string(),
  preemptionEnabled: z.boolean(),
  preemptionWindowSec: z.number(),
  courtApprovalRef: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  closedReason: z.string().nullable(),
  closedAt: z.iso.datetime().nullable(),
});
export type AuctionDto = z.infer<typeof auctionDtoSchema>;
