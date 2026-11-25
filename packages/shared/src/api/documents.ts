import { z } from 'zod';

/** Document kinds a trustee can attach to a lot. */
export const LOT_DOCUMENT_KINDS = [
  'LAND_REGISTRY_EXTRACT',
  'APPRAISAL_REPORT',
  'LAND_USE_CERTIFICATE',
  'ENERGY_CERTIFICATE',
  'PHOTO',
  'OTHER',
] as const;
export const lotDocumentKindSchema = z.enum(LOT_DOCUMENT_KINDS, {
  error: 'Izberite vrsto dokumenta.',
});
export type LotDocumentKind = z.infer<typeof lotDocumentKindSchema>;

export const LOT_DOCUMENT_KIND_LABEL: Record<LotDocumentKind, string> = {
  LAND_REGISTRY_EXTRACT: 'Izpisek iz zemljiške knjige',
  APPRAISAL_REPORT: 'Cenitveno poročilo',
  LAND_USE_CERTIFICATE: 'Potrdilo o namenski rabi',
  ENERGY_CERTIFICATE: 'Energetska izkaznica',
  PHOTO: 'Fotografija',
  OTHER: 'Drugo',
};

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const documentDtoSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string().length(64),
  createdAt: z.iso.datetime(),
});
export type DocumentDto = z.infer<typeof documentDtoSchema>;
