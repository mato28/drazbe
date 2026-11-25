/** Formats integer cents as a Slovenian EUR amount, e.g. 18500000n -> "185.000,00 €". */
export function formatCents(cents: bigint | string): string {
  const value = typeof cents === 'string' ? BigInt(cents) : cents;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const euros = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${euros},${rest} €`;
}

/** Same as formatCents but without the currency sign (for input fields). */
export function centsToInput(cents: bigint | string): string {
  return formatCents(cents).replace(' €', '');
}

/**
 * Parses a user-typed EUR amount into integer cents without ever touching floats.
 * Accepts Slovenian notation ("185.000,50", "185000,5", "185 000 €") and plain "185000.50".
 * Returns null when the text is not a valid non-negative amount.
 */
export function parseEuroInput(input: string): bigint | null {
  const s = input.replace(/[\s€]/g, '').replace(/EUR$/i, ''); // \s also matches NBSP
  if (s === '') return null;

  let whole: string;
  let fraction = '';
  if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length !== 2) return null;
    whole = (parts[0] ?? '').replaceAll('.', '');
    fraction = parts[1] ?? '';
    // Dots before a decimal comma must be proper thousands separators.
    if (parts[0]?.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(parts[0])) return null;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    whole = s.replaceAll('.', ''); // "185.000" = one hundred eighty-five thousand
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [whole = '', fraction = ''] = s.split('.'); // "185000.5"
  } else {
    whole = s;
  }

  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction) || whole.length > 13) return null;
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
}
