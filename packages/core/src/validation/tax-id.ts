/** Strips an optional "SI" prefix and spaces: "SI 1234 5678" -> "12345678". */
export function normalizeTaxId(input: string): string {
  return input.replace(/\s+/g, '').replace(/^SI/i, '');
}

/**
 * Slovenian davčna številka: 8 digits, the last is a mod-11 check digit
 * (weights 8..2 over the first seven digits).
 */
export function isValidSlovenianTaxId(taxId: string): boolean {
  if (!/^[1-9]\d{7}$/.test(taxId)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(taxId[i]) * (8 - i);
  const r = 11 - (sum % 11);
  if (r === 11) return false;
  const check = r === 10 ? 0 : r;
  return check === Number(taxId[7]);
}
