'use client';

import { type VatLookupDto } from '@domik/shared';
import { type RefObject, useRef, useState } from 'react';
import { apiGet } from '@/lib/api-client';

type FoundRecord = Extract<VatLookupDto, { status: 'FOUND' }>;

/** Form input name -> which part of the VIES record goes into it. */
export type VatFieldMap = Partial<
  Record<string, keyof Pick<FoundRecord, 'name' | 'street' | 'postalCity' | 'address'>>
>;

const LOOKS_LIKE_TAX_ID = /^(SI)?\d{8}$/i;

/**
 * On blur of a tax-number input, looks the number up in VIES and fills the mapped inputs of
 * `formRef`. Only empty inputs, or ones this hook filled earlier and the user left untouched,
 * are overwritten — never something the user typed. Returns a hint for the tax-number field.
 */
export function useVatAutofill(formRef: RefObject<HTMLFormElement | null>, fields: VatFieldMap) {
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastLookup = useRef<string | null>(null);
  const filled = useRef<Record<string, string>>({});

  async function lookup(raw: string) {
    const taxId = raw.replace(/\s+/g, '');
    if (!LOOKS_LIKE_TAX_ID.test(taxId) || taxId === lastLookup.current) return;
    lastLookup.current = taxId;
    setLoading(true);
    setHint('Iščem podatke v registru VIES …');
    const result = await apiGet<VatLookupDto>(`/api/vat-lookup?taxId=${encodeURIComponent(taxId)}`);
    setLoading(false);
    if (!result.ok) {
      // Invalid checksum etc. — the form's own validation reports it on save.
      setHint(null);
      lastLookup.current = null;
      return;
    }
    const data = result.data;
    if (data.status === 'NOT_FOUND') {
      setHint('Davčne številke ni v registru VIES (ni zavezanec za DDV). Podatke vpišite ročno.');
      return;
    }
    if (data.status === 'UNAVAILABLE') {
      setHint('Register VIES trenutno ni dosegljiv. Podatke vpišite ročno.');
      lastLookup.current = null;
      return;
    }
    const form = formRef.current;
    if (!form) return;
    let count = 0;
    for (const [name, key] of Object.entries(fields)) {
      if (!key) continue;
      const input = form.elements.namedItem(name);
      const value = data[key];
      if (!(input instanceof HTMLInputElement) || !value) continue;
      const current = input.value.trim();
      if (current !== '' && current !== filled.current[name]) continue;
      input.value = value;
      filled.current[name] = value;
      count++;
    }
    setHint(
      count > 0
        ? `Podatki iz registra VIES: ${data.name}. Preverite jih pred shranjevanjem.`
        : `V registru VIES: ${data.name}, ${data.address}.`,
    );
  }

  return {
    hint: loading ? 'Iščem podatke v registru VIES …' : hint,
    onBlur: (e: { currentTarget: HTMLInputElement }) => void lookup(e.currentTarget.value),
  };
}
