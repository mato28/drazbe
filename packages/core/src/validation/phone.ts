/**
 * Normalizes a Slovenian phone number to E.164 ("041 123 456" -> "+38641123456").
 * Numbers already in international form are kept. Returns null if it cannot be a phone number.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[\s/().-]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (/^0\d{8}$/.test(digits)) digits = `+386${digits.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
