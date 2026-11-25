import { z } from 'zod';

export const REQUIRED = 'Polje je obvezno.';

/** Required, trimmed text. */
export const requiredText = (max = 500) =>
  z.string({ error: REQUIRED }).trim().min(1, REQUIRED).max(max, `Največ ${max} znakov.`);

/** Optional text: missing, null or blank all become null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Največ ${max} znakov.`)
    .nullish()
    .transform((v) => (v == null || v === '' ? null : v));

/** Money on the wire: integer cents as a decimal string (JSON has no bigint). */
export const centsString = z
  .string({ error: REQUIRED })
  .regex(/^\d{1,15}$/, 'Neveljaven znesek.')
  .transform((v) => BigInt(v));

export const optionalCentsString = z
  .string()
  .regex(/^\d{1,15}$/, 'Neveljaven znesek.')
  .nullish()
  .transform((v) => (v == null ? null : BigInt(v)));

/** Instant on the wire: ISO 8601 with offset; parsed to Date. */
export const isoInstant = z.iso
  .datetime({ offset: true, error: 'Neveljaven datum in ura.' })
  .transform((v) => new Date(v));

export const optionalIsoInstant = z.iso
  .datetime({ offset: true, error: 'Neveljaven datum in ura.' })
  .nullish()
  .transform((v) => (v == null ? null : new Date(v)));

export const seconds = (min: number, max: number) =>
  z
    .number({ error: 'Vnesite celo število.' })
    .int('Vnesite celo število.')
    .min(min, `Najmanj ${min}.`)
    .max(max, `Največ ${max}.`);

export const API_ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL',
] as const;

/** Every non-2xx API response has this shape. `fields` maps input field -> message. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
