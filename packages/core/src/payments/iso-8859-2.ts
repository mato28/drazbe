// Code points of ISO 8859-2 bytes 0xA0–0xFF (generated from the standard code table).
const HIGH =
  '\u00a0\u0104\u02d8\u0141\u00a4\u013d\u015a\u00a7\u00a8\u0160\u015e\u0164\u0179\u00ad\u017d\u017b\u00b0\u0105\u02db\u0142\u00b4\u013e\u015b\u02c7\u00b8\u0161\u015f\u0165\u017a\u02dd\u017e\u017c\u0154\u00c1\u00c2\u0102\u00c4\u0139\u0106\u00c7\u010c\u00c9\u0118\u00cb\u011a\u00cd\u00ce\u010e\u0110\u0143\u0147\u00d3\u00d4\u0150\u00d6\u00d7\u0158\u016e\u00da\u0170\u00dc\u00dd\u0162\u00df\u0155\u00e1\u00e2\u0103\u00e4\u013a\u0107\u00e7\u010d\u00e9\u0119\u00eb\u011b\u00ed\u00ee\u010f\u0111\u0144\u0148\u00f3\u00f4\u0151\u00f6\u00f7\u0159\u016f\u00fa\u0171\u00fc\u00fd\u0163\u02d9';

const BYTE_BY_CHAR = new Map<string, number>(Array.from(HIGH).map((ch, i) => [ch, 0xa0 + i]));

/** Can every character of `text` be represented in ISO 8859-2? */
export function isLatin2(text: string): boolean {
  return Array.from(text).every((ch) => ch.charCodeAt(0) < 0x80 || BYTE_BY_CHAR.has(ch));
}

/**
 * Encodes text as ISO 8859-2 (the character set required by the UPN QR standard).
 * Characters outside the set are replaced with "?".
 */
export function encodeLatin2(text: string): Uint8Array {
  const chars = Array.from(text);
  const out = new Uint8Array(chars.length);
  chars.forEach((ch, i) => {
    const code = ch.charCodeAt(0);
    out[i] = ch.length === 1 && code < 0x80 ? code : (BYTE_BY_CHAR.get(ch) ?? 0x3f);
  });
  return out;
}

export function decodeLatin2(bytes: Uint8Array): string {
  return [...bytes]
    .map((b) => (b < 0xa0 ? String.fromCharCode(b) : (HIGH[b - 0xa0] ?? '?')))
    .join('');
}
