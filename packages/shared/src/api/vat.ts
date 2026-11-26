import { z } from 'zod';
import { requiredText } from './common';

/** `GET /api/vat-lookup?taxId=...` — the tax number as typed (SI prefix and spaces allowed). */
export const vatLookupQuerySchema = z.object({
  taxId: requiredText(20),
});
export type VatLookupQuery = z.infer<typeof vatLookupQuerySchema>;

/**
 * Result of a lookup in the EU VIES register. Only VAT-registered entities are listed, so
 * NOT_FOUND is normal for natural persons and small companies; UNAVAILABLE means VIES or the
 * Slovenian registry did not answer and the user simply fills the fields by hand.
 */
export const vatLookupDtoSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('FOUND'),
    taxId: z.string(),
    name: z.string(),
    /** Street and house number, e.g. "DUNAJSKA CESTA 107". */
    street: z.string(),
    /** Postal code and post office, e.g. "1000 LJUBLJANA". */
    postalCity: z.string(),
    /** One-line address: "street, postalCity". */
    address: z.string(),
  }),
  z.object({ status: z.literal('NOT_FOUND'), taxId: z.string() }),
  z.object({ status: z.literal('UNAVAILABLE'), taxId: z.string() }),
]);
export type VatLookupDto = z.infer<typeof vatLookupDtoSchema>;
