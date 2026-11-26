import { type VatLookupDto } from '@domik/shared';

/** Company data from a VAT register, keyed by the 8-digit Slovenian tax number. */
export type VatRecord = Omit<Extract<VatLookupDto, { status: 'FOUND' }>, 'status' | 'taxId'>;

export type VatRegistryResult =
  { status: 'FOUND'; record: VatRecord } | { status: 'NOT_FOUND' } | { status: 'UNAVAILABLE' };

/** VAT register port. MVP implementation: EU VIES (REST API of the European Commission). */
export interface VatRegistry {
  /** `taxId` is already normalized and checksum-valid (8 digits, no SI prefix). */
  lookup(taxId: string): Promise<VatRegistryResult>;
}

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SI/vat/';

/** VIES uses "---" or "" when a member state does not disclose a field. */
function present(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v === '' || v === '---' ? null : v;
}

/**
 * Splits a Slovenian VIES address into street and post. Seen formats:
 *   "ŠMARJEŠKA CESTA 6, 8501 NOVO MESTO"
 *   "DUNAJSKA CESTA 050, LJUBLJANA, 1000 LJUBLJANA"   (settlement in the middle)
 * House numbers come zero-padded ("050"); the padding is dropped.
 */
export function parseViesAddress(raw: string): { street: string; postalCity: string } {
  const parts = raw
    .split(/[,\n]/)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const postIndex = parts.findLastIndex((p) => /^\d{4}\s/.test(p));
  const postalCity = postIndex >= 0 ? (parts[postIndex] ?? '') : '';
  const streetPart = (postIndex === 0 ? '' : parts[0]) ?? '';
  const street = streetPart.replace(/(\s)0+(\d)/g, '$1$2');
  return { street, postalCity };
}

export function viesRecord(body: unknown): VatRegistryResult {
  if (typeof body !== 'object' || body === null) return { status: 'UNAVAILABLE' };
  const b = body as Record<string, unknown>;
  if (b.isValid !== true) {
    // INVALID = not in the register; anything else (MS_UNAVAILABLE, TIMEOUT, ...) is transient.
    return b.userError === 'INVALID' ? { status: 'NOT_FOUND' } : { status: 'UNAVAILABLE' };
  }
  const name = present(b.name) ?? '';
  const rawAddress = present(b.address);
  const { street, postalCity } = rawAddress
    ? parseViesAddress(rawAddress)
    : { street: '', postalCity: '' };
  const address = [street, postalCity].filter(Boolean).join(', ');
  return { status: 'FOUND', record: { name, street, postalCity, address } };
}

export class ViesVatRegistry implements VatRegistry {
  constructor(private readonly options: { timeoutMs?: number; fetch?: typeof fetch } = {}) {}

  async lookup(taxId: string): Promise<VatRegistryResult> {
    const doFetch = this.options.fetch ?? fetch;
    try {
      const response = await doFetch(VIES_URL + encodeURIComponent(taxId), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 8000),
      });
      if (!response.ok) return { status: 'UNAVAILABLE' };
      return viesRecord(await response.json());
    } catch {
      return { status: 'UNAVAILABLE' };
    }
  }
}
