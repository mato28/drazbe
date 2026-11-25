import qrcodegenModule from 'nayuki-qr-code-generator';
import { normalizeIban } from '../validation/iban';
import { decodeLatin2, encodeLatin2 } from './iso-8859-2';
import { compactReference } from './sklic';

/**
 * UPN QR — the QR code on Slovenian payment orders (standard of Združenje bank Slovenije).
 *
 * The content is 19 fields, each terminated by LF, followed by a 3-digit control sum
 * (total length of the 19 fields including their LFs) and a trailing LF.
 * Encoding: ISO 8859-2 (ECI 000004), QR version 15, error correction level M.
 */

export interface UpnPayment {
  /** Payer is optional: the bidder's banking app fills it in. */
  payerName?: string;
  payerAddress?: string;
  payerCity?: string;
  amountCents: bigint;
  /** ISO 20022 purpose code, 4 letters (e.g. OTHR). */
  purposeCode: string;
  /** Namen plačila, max 42 characters. */
  purpose: string;
  /** Rok plačila. */
  dueDate?: Date;
  payeeIban: string;
  /** SI00 reference in any spacing, e.g. "SI00 1042-7". */
  payeeReference: string;
  payeeName: string;
  payeeAddress: string;
  payeeCity: string;
}

export const UPN_QR_MAX_LENGTH = 411;
const MAX_AMOUNT_CENTS = 99_999_999_999n; // 11 digits

/** Trims, collapses whitespace (incl. line breaks, which would break the format) and truncates. */
function field(value: string | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function upnDate(date: Date | undefined): string {
  if (!date) return '';
  // Calendar date in Slovenia.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')}`;
}

/** The 19 fields in order, as text. */
export function upnQrFields(p: UpnPayment): string[] {
  if (p.amountCents <= 0n || p.amountCents > MAX_AMOUNT_CENTS) {
    throw new Error('UPN amount must be between 0,01 and 999.999.999,99 EUR');
  }
  if (!/^[A-Z]{4}$/.test(p.purposeCode)) throw new Error('UPN purpose code must be 4 letters');
  const reference = compactReference(p.payeeReference);
  if (!reference) throw new Error(`Invalid payee reference: ${p.payeeReference}`);
  const payeeName = field(p.payeeName, 33);
  if (payeeName === '') throw new Error('UPN payee name is required');

  return [
    'UPNQR', // 1  vodilni slog
    '', // 2  IBAN plačnika
    '', // 3  polog
    '', // 4  dvig
    '', // 5  referenca plačnika
    field(p.payerName, 33), // 6
    field(p.payerAddress, 33), // 7
    field(p.payerCity, 33), // 8
    p.amountCents.toString().padStart(11, '0'), // 9  znesek
    '', // 10 datum plačila
    '', // 11 nujno
    p.purposeCode, // 12 koda namena
    field(p.purpose, 42), // 13 namen plačila
    upnDate(p.dueDate), // 14 rok plačila
    normalizeIban(p.payeeIban), // 15 IBAN prejemnika
    reference, // 16 referenca prejemnika
    payeeName, // 17
    field(p.payeeAddress, 33), // 18
    field(p.payeeCity, 33), // 19
  ];
}

/** Full QR content: fields, control sum, trailing LF. */
export function buildUpnQrPayload(p: UpnPayment): string {
  const body = upnQrFields(p)
    .map((f) => `${f}\n`)
    .join('');
  const payload = `${body}${String(body.length).padStart(3, '0')}\n`;
  if (payload.length > UPN_QR_MAX_LENGTH) throw new Error('UPN QR content is too long');
  return payload;
}

export interface ParsedUpnQr {
  amountCents: bigint;
  purposeCode: string;
  purpose: string;
  dueDate: string;
  payeeIban: string;
  payeeReference: string;
  payeeName: string;
  payeeAddress: string;
  payeeCity: string;
}

/**
 * Strict reader for UPN QR content. Throws when the structure, the field formats or the
 * control sum are wrong — used to prove that what we generate is a valid UPN QR.
 */
export function parseUpnQrPayload(payload: string): ParsedUpnQr {
  if (payload.length > UPN_QR_MAX_LENGTH) throw new Error('too long');
  const lines = payload.split('\n');
  // 19 fields + control sum + empty string after the final LF
  if (lines.length !== 21 || lines[20] !== '') throw new Error('expected 19 fields + control sum');
  const fields = lines.slice(0, 19);
  const f = (i: number): string => fields[i - 1] ?? '';

  const expected = fields.reduce((sum, x) => sum + x.length + 1, 0);
  if (lines[19] !== String(expected).padStart(3, '0')) throw new Error('control sum mismatch');
  if (f(1) !== 'UPNQR') throw new Error('missing UPNQR header');
  if (!/^\d{11}$/.test(f(9))) throw new Error('amount must be 11 digits');
  if (!/^[A-Z]{4}$/.test(f(12))) throw new Error('bad purpose code');
  if (f(13).length > 42) throw new Error('purpose too long');
  if (f(14) !== '' && !/^\d{2}\.\d{2}\.\d{4}$/.test(f(14))) throw new Error('bad due date');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(f(15))) throw new Error('bad payee IBAN');
  if (!/^(SI|RF)\d{2}[0-9A-Z-]{0,22}$/.test(f(16))) throw new Error('bad payee reference');
  for (const i of [6, 7, 8, 17, 18, 19]) {
    if (f(i).length > 33) throw new Error(`field ${i} too long`);
    if (f(i) !== f(i).trim()) throw new Error(`field ${i} has surrounding spaces`);
  }
  if (f(17) === '') throw new Error('payee name missing');

  return {
    amountCents: BigInt(f(9)),
    purposeCode: f(12),
    purpose: f(13),
    dueDate: f(14),
    payeeIban: f(15),
    payeeReference: f(16),
    payeeName: f(17),
    payeeAddress: f(18),
    payeeCity: f(19),
  };
}

// The library is CommonJS; depending on the loader the namespace is the default export or nested.
const qrcodegen =
  (qrcodegenModule as unknown as { default?: typeof qrcodegenModule }).default ?? qrcodegenModule;

export interface QrMatrix {
  /** Modules per side (77 for version 15). */
  size: number;
  /** Row-major, true = dark. */
  modules: boolean[][];
}

/** UPN QR symbol: version 15, ECC level M, ECI 4 (ISO 8859-2), byte mode. */
export function upnQrMatrix(payload: string): QrMatrix {
  const { QrCode, QrSegment } = qrcodegen;
  const segments = [QrSegment.makeEci(4), QrSegment.makeBytes([...encodeLatin2(payload)])];
  const qr = QrCode.encodeSegments(segments, QrCode.Ecc.MEDIUM, 15, 15, -1, false);
  const modules = Array.from({ length: qr.size }, (_, y) =>
    Array.from({ length: qr.size }, (_, x) => qr.getModule(x, y)),
  );
  return { size: qr.size, modules };
}

/** Standalone SVG of the symbol with the 4-module quiet zone the standard requires. */
export function qrMatrixToSvg(matrix: QrMatrix, quietZone = 4): string {
  const total = matrix.size + quietZone * 2;
  let path = '';
  matrix.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + quietZone},${y + quietZone}h1v1h-1z`;
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export { decodeLatin2 };
