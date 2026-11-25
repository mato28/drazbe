import { z } from 'zod';
import { centsString, isoInstant, optionalText, requiredText } from './common';
import { documentDtoSchema } from './documents';

export const SALE_STATUSES = [
  'AWAITING_CONTRACT',
  'CONTRACT_SIGNED',
  'DOWN_PAYMENT_PAID',
  'PRICE_PAID',
  'TRANSFER_PROPOSED',
  'TRANSFER_ORDER_ISSUED',
  'REGISTERED',
  'DEFAULTED',
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  AWAITING_CONTRACT: 'Čaka na podpis pogodbe',
  CONTRACT_SIGNED: 'Pogodba podpisana',
  DOWN_PAYMENT_PAID: 'Ara plačana',
  PRICE_PAID: 'Kupnina plačana',
  TRANSFER_PROPOSED: 'Predlog za izdajo sklepa o izročitvi',
  TRANSFER_ORDER_ISSUED: 'Sklep o izročitvi izdan',
  REGISTERED: 'Vpisano v zemljiško knjigo',
  DEFAULTED: 'Kupec ni izpolnil obveznosti',
};

/** Steps the trustee records after signing, in order. */
export const SALE_STEP_VALUES = [
  'DOWN_PAYMENT_PAID',
  'PRICE_PAID',
  'TRANSFER_PROPOSED',
  'TRANSFER_ORDER_ISSUED',
  'REGISTERED',
] as const;
export type SaleStepValue = (typeof SALE_STEP_VALUES)[number];

export const SALE_STEP_ACTION_LABEL: Record<SaleStepValue, string> = {
  DOWN_PAYMENT_PAID: 'Ara je plačana',
  PRICE_PAID: 'Kupnina je v celoti plačana',
  TRANSFER_PROPOSED: 'Sodišču predlagan sklep o izročitvi',
  TRANSFER_ORDER_ISSUED: 'Sodišče je izdalo sklep o izročitvi',
  REGISTERED: 'Kupec je vpisan v zemljiško knjigo',
};

const days = z.coerce
  .number({ error: 'Vnesite število dni.' })
  .int('Vnesite celo število dni.')
  .min(1, 'Najmanj 1 dan.')
  .max(365, 'Največ 365 dni.');

export const contractTermsSchema = z.object({
  downPaymentCents: centsString.optional(),
  downPaymentDays: days.optional(),
  priceDays: days.optional(),
});
export type ContractTermsInput = z.output<typeof contractTermsSchema>;

export const saleStepSchema = z.object({
  step: z.enum(SALE_STEP_VALUES, { error: 'Izberite korak.' }),
  at: isoInstant.optional(),
  reference: optionalText(100),
});

export const declareDefaultSchema = z.object({ reason: requiredText(1000) });

export const refundIbanSchema = z.object({ iban: requiredText(42) });

export const refundOrderSchema = z.object({
  executionDate: z.iso.date({ error: 'Neveljaven datum.' }).optional(),
});

export const markRefundedSchema = z.object({
  registrationIds: z.array(z.uuid()).min(1, 'Izberite vsaj eno varščino.'),
});

/** Multipart field next to `file` when the contract was signed on paper. */
export const paperSignedFieldsSchema = z.object({ signedAt: isoInstant });

export const signatureCheckDtoSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string(),
  requireQualified: z.boolean(),
  problems: z.array(z.string()),
  signatures: z.array(
    z.object({
      signedBy: z.string().nullable(),
      indication: z.string(),
      subIndication: z.string().nullable(),
      qualification: z.string().nullable(),
      signingTime: z.string().nullable(),
      matches: z.string().nullable(),
    }),
  ),
});
export type SignatureCheckDto = z.infer<typeof signatureCheckDtoSchema>;

export const saleDtoSchema = z.object({
  id: z.uuid(),
  auctionId: z.uuid(),
  status: z.enum(SALE_STATUSES),
  priceCents: z.string(),
  depositAppliedCents: z.string(),
  downPaymentCents: z.string(),
  downPaymentDays: z.number().int(),
  priceDays: z.number().int(),
  contractDeadline: z.iso.datetime(),
  downPaymentDeadline: z.iso.datetime().nullable(),
  priceDeadline: z.iso.datetime().nullable(),
  contractSignedAt: z.iso.datetime().nullable(),
  signedOnPaper: z.boolean(),
  defaultReason: z.string().nullable(),
});
export type SaleDto = z.infer<typeof saleDtoSchema>;

export const signedUploadDtoSchema = z.object({
  document: documentDtoSchema,
  check: signatureCheckDtoSchema,
});

export const refundOrderDtoSchema = z.object({
  document: documentDtoSchema,
  included: z.array(z.object({ pseudonym: z.string(), amountCents: z.string() })),
  missingIban: z.array(z.string()),
});
