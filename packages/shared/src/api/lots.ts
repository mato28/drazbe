import { z } from 'zod';
import { optionalCentsString, optionalText, requiredText } from './common';

export const PROPERTY_KINDS = [
  'APARTMENT',
  'HOUSE',
  'COMMERCIAL',
  'LAND',
  'GARAGE',
  'OTHER',
] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const PROPERTY_KIND_LABEL: Record<PropertyKind, string> = {
  APARTMENT: 'Stanovanje',
  HOUSE: 'Hiša',
  COMMERCIAL: 'Poslovni prostor',
  LAND: 'Zemljišče',
  GARAGE: 'Garaža ali parkirno mesto',
  OTHER: 'Drugo',
};

export const lotInputSchema = z.object({
  title: requiredText(300),
  propertyKind: z.enum(PROPERTY_KINDS, { error: 'Izberite vrsto nepremičnine.' }),
  /** Town / municipality, shown publicly and used for the location filter. */
  municipality: requiredText(100),
  description: optionalText(10_000),
  cadastralMunicipality: optionalText(200),
  parcelNumber: optionalText(100),
  buildingId: optionalText(50),
  partId: optionalText(50),
  idZnak: optionalText(100),
  /** Square metres as a decimal string with up to 2 decimals, e.g. "58.40". */
  areaM2: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Vnesite površino, npr. 58,40.')
    .nullish()
    .transform((v) => v ?? null),
  address: optionalText(500),
  encumbrancesText: optionalText(10_000),
  appraisalValueCents: optionalCentsString,
  landUse: optionalText(300),
  isAgricultural: z.boolean().default(false),
});
export type LotInput = z.infer<typeof lotInputSchema>;

export const lotDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  type: z.literal('REAL_ESTATE'),
  title: z.string(),
  propertyKind: z.enum(PROPERTY_KINDS),
  municipality: z.string().nullable(),
  description: z.string().nullable(),
  cadastralMunicipality: z.string().nullable(),
  parcelNumber: z.string().nullable(),
  buildingId: z.string().nullable(),
  partId: z.string().nullable(),
  idZnak: z.string().nullable(),
  areaM2: z.string().nullable(),
  address: z.string().nullable(),
  encumbrancesText: z.string().nullable(),
  appraisalValueCents: z.string().nullable(),
  landUse: z.string().nullable(),
  isAgricultural: z.boolean(),
});
export type LotDto = z.infer<typeof lotDtoSchema>;
