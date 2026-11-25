import { z } from 'zod';
import { optionalText, requiredText } from './common';

export const BIDDER_TYPES = ['PERSON', 'COMPANY'] as const;
export type BidderType = (typeof BIDDER_TYPES)[number];

export const BIDDER_TYPE_LABEL: Record<BidderType, string> = {
  PERSON: 'Fizična oseba',
  COMPANY: 'Pravna oseba',
};

export const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const IDENTITY_STATUS_LABEL: Record<VerificationStatus, string> = {
  PENDING: 'Čaka na preverjanje',
  VERIFIED: 'Potrjena',
  REJECTED: 'Zavrnjena',
};

/** Slovenian phone number in international or national form; normalized by core. */
export const phoneSchema = z
  .string({ error: 'Polje je obvezno.' })
  .trim()
  .regex(/^(\+|00)?[\d\s/().-]{8,20}$/, 'Vnesite telefonsko številko, npr. 041 123 456.');

/** Shape only — per-type required fields and the tax-number check live in @domik/core. */
export const bidderProfileInputSchema = z.object({
  type: z.enum(BIDDER_TYPES, { error: 'Izberite vrsto dražitelja.' }),
  /** The natural person: the bidder, or the person acting for the company. */
  fullName: requiredText(200),
  taxId: requiredText(20),
  address: requiredText(300),
  phone: phoneSchema,
  companyName: optionalText(300),
  companyRegNo: optionalText(20),
  representativeName: optionalText(200),
  /** COMPANY: is `fullName` the legal representative? If not, a power of attorney is required. */
  actsAsLegalRepresentative: z.boolean().default(true),
});
export type BidderProfileInput = z.infer<typeof bidderProfileInputSchema>;

/** Document kinds a bidder attaches to the profile. */
export const BIDDER_DOCUMENT_KINDS = [
  'ID_DOCUMENT',
  'POWER_OF_ATTORNEY',
  'COMPANY_REGISTRY_EXTRACT',
] as const;
export const bidderDocumentKindSchema = z.enum(BIDDER_DOCUMENT_KINDS, {
  error: 'Izberite vrsto dokumenta.',
});
export type BidderDocumentKind = z.infer<typeof bidderDocumentKindSchema>;

export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  ID_DOCUMENT: 'Osebni dokument',
  POWER_OF_ATTORNEY: 'Pooblastilo',
  COMPANY_REGISTRY_EXTRACT: 'Izpisek iz poslovnega registra',
  EXCLUSION_STATEMENT: 'Podpisana izjava',
  PREEMPTION_PROOF: 'Dokazilo o predkupni pravici',
};

export const bidderProfileDtoSchema = z.object({
  id: z.uuid(),
  type: z.enum(BIDDER_TYPES),
  fullName: z.string(),
  taxId: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
  companyName: z.string().nullable(),
  companyRegNo: z.string().nullable(),
  representativeName: z.string().nullable(),
  actsAsLegalRepresentative: z.boolean(),
  status: z.enum(VERIFICATION_STATUSES),
  rejectionReason: z.string().nullable(),
});
export type BidderProfileDto = z.infer<typeof bidderProfileDtoSchema>;
