/** Removes spaces and uppercases: "si56 0510 ..." -> "SI560510...". */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** Country -> total IBAN length, for the countries we expect estate accounts in. */
const IBAN_LENGTH: Record<string, number> = { SI: 19, AT: 20, HR: 21, IT: 27, DE: 22, HU: 28 };

/** ISO 13616 mod-97 check on a normalized IBAN. */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expected = IBAN_LENGTH[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** "SI56051008012340041" -> "SI56 0510 0801 2340 041" */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})(?=.)/g, '$1 ');
}
