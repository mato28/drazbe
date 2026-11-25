import { z } from 'zod';
import { VERIFICATION_STATUSES } from './bidders';
import { requiredText } from './common';

export const REGISTRATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  PENDING: 'V obravnavi',
  APPROVED: 'Potrjena',
  REJECTED: 'Zavrnjena',
};

export const DEPOSIT_STATUSES = [
  'PENDING',
  'PAID',
  'REFUND_PENDING',
  'REFUNDED',
  'APPLIED',
  'FORFEITED',
] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];
export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  PENDING: 'Ni plačana',
  PAID: 'Plačana',
  REFUND_PENDING: 'Čaka na vračilo',
  REFUNDED: 'Vrnjena',
  APPLIED: 'Všteta v kupnino',
  FORFEITED: 'Zadržana',
};

const reason = requiredText(2000).refine(
  (v) => v.length >= 10,
  'Navedite razlog (vsaj 10 znakov).',
);

/** Trustee's decision on the bidder's identity. */
export const identityDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('VERIFIED') }),
  z.object({ decision: z.literal('REJECTED'), reason }),
]);
export type IdentityDecision = z.infer<typeof identityDecisionSchema>;

export const depositUpdateSchema = z.object({
  status: z.enum(['PAID', 'PENDING']),
  /** How the payment was established, e.g. "izpisek 27. 11. 2026". */
  note: z.string().trim().max(500).optional(),
});
export type DepositUpdate = z.infer<typeof depositUpdateSchema>;

export const preemptionUpdateSchema = z.discriminatedUnion('isHolder', [
  z.object({ isHolder: z.literal(false) }),
  z.object({
    isHolder: z.literal(true),
    rank: z
      .number({ error: 'Vnesite vrstni red.' })
      .int('Vnesite celo število.')
      .min(1, 'Vrstni red se začne z 1.')
      .max(99),
  }),
]);
export type PreemptionUpdate = z.infer<typeof preemptionUpdateSchema>;

export const registrationRejectSchema = z.object({ reason });

/** One confirmed line of a bank statement import. */
export const confirmDepositMatchesSchema = z.object({
  matches: z
    .array(
      z.object({
        registrationId: z.uuid(),
        amountCents: z
          .string()
          .regex(/^\d{1,15}$/)
          .transform((v) => BigInt(v)),
        payerName: z.string().max(200),
        bookingDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        bankReference: z.string().max(100).nullable(),
      }),
    )
    .min(1, 'Izberite vsaj eno plačilo.')
    .max(500),
});
export type ConfirmDepositMatches = z.infer<typeof confirmDepositMatchesSchema>;

export const registrationDtoSchema = z.object({
  id: z.uuid(),
  auctionId: z.uuid(),
  seq: z.number().int(),
  pseudonym: z.string(),
  paymentReference: z.string(),
  status: z.enum(REGISTRATION_STATUSES),
  depositStatus: z.enum(DEPOSIT_STATUSES),
  identityStatus: z.enum(VERIFICATION_STATUSES),
  statementUploaded: z.boolean(),
  isPreemptionHolder: z.boolean(),
  preemptionRank: z.number().int().nullable(),
  rejectionReason: z.string().nullable(),
});
export type RegistrationDto = z.infer<typeof registrationDtoSchema>;

/** Whether the signed-in user may bid in an auction right now. */
export const biddingAccessSchema = z.object({
  auctionId: z.uuid(),
  pseudonym: z.string(),
  isPreemptionHolder: z.boolean(),
});
export type BiddingAccess = z.infer<typeof biddingAccessSchema>;
