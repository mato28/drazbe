import { z } from 'zod';
import { AUCTION_TYPES } from './auctions';
import { PROPERTY_KINDS } from './lots';

/** What a visitor sees instead of the internal auction status. */
export const PUBLIC_PHASES = [
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'LIVE',
  'ENDED',
  'UNSUCCESSFUL',
  'CANCELLED',
] as const;
export type PublicPhase = (typeof PUBLIC_PHASES)[number];

export const PUBLIC_PHASE_LABEL: Record<PublicPhase, string> = {
  REGISTRATION_OPEN: 'Prijave odprte',
  REGISTRATION_CLOSED: 'Prijave zaključene',
  LIVE: 'Dražba poteka',
  ENDED: 'Zaključena',
  UNSUCCESSFUL: 'Neuspešna',
  CANCELLED: 'Preklicana',
};

/** Phases offered in the list filter (finished auctions are not listed). */
export const LISTED_PHASES = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE'] as const;

export const PUBLIC_PAGE_SIZE = 12;

const wholeEuros = z
  .string()
  .trim()
  .regex(/^\d{1,12}$/)
  .transform((v) => BigInt(v) * 100n);

/**
 * Query string of the public auction list (Slovenian parameter names).
 * Lenient on purpose: an unknown or malformed value is ignored rather than an error,
 * so hand-edited and stale links still work.
 */
export const publicAuctionQuerySchema = z.object({
  vrsta: z.enum(PROPERTY_KINDS).optional().catch(undefined),
  kraj: z.string().trim().min(1).max(100).optional().catch(undefined),
  nacin: z.enum(AUCTION_TYPES).optional().catch(undefined),
  stanje: z.enum(LISTED_PHASES).optional().catch(undefined),
  cenaOd: wholeEuros.optional().catch(undefined),
  cenaDo: wholeEuros.optional().catch(undefined),
  stran: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type PublicAuctionQuery = z.infer<typeof publicAuctionQuerySchema>;
