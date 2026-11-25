import { z } from 'zod';
import { requiredText } from './common';

export const caseInputSchema = z.object({
  court: requiredText(200),
  caseNumber: requiredText(50),
  debtorName: requiredText(300),
  debtorTaxId: requiredText(20),
  /** Registered seat; printed as the payee address on deposit payment orders. */
  debtorAddress: requiredText(100),
  debtorCity: requiredText(100),
  estateIban: requiredText(42),
  estateBank: requiredText(200),
});
export type CaseInput = z.infer<typeof caseInputSchema>;

export const caseDtoSchema = z.object({
  id: z.uuid(),
  court: z.string(),
  caseNumber: z.string(),
  debtorName: z.string(),
  debtorTaxId: z.string(),
  debtorAddress: z.string().nullable(),
  debtorCity: z.string().nullable(),
  estateIban: z.string(),
  estateBank: z.string(),
  createdAt: z.iso.datetime(),
});
export type CaseDto = z.infer<typeof caseDtoSchema>;
