import { parseEuroInput } from '@domik/shared';
import { XMLParser } from 'fast-xml-parser';
import { DomainError } from '../errors';
import { compactReference, findReferenceInText } from './sklic';

/** One incoming payment from a bank statement. */
export interface BankTransaction {
  /** Position in the file (1-based), to tell identical-looking payments apart. */
  line: number;
  /** Booking date, ISO "YYYY-MM-DD". */
  bookingDate: string | null;
  amountCents: bigint;
  payerName: string;
  /** SI00 reference in compact form ("SI001001-1"), if one was found. */
  reference: string | null;
  /** Free-text purpose / remittance information. */
  description: string;
  /** Bank's own id of the transaction, if any. */
  bankReference: string | null;
}

const fail = (message: string): DomainError =>
  new DomainError('VALIDATION', message, { file: message });

type Xml = Record<string, unknown>;
const asArray = (v: unknown): unknown[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
const obj = (v: unknown): Xml => (v !== null && typeof v === 'object' ? (v as Xml) : {});
const text = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  // Element with attributes: fast-xml-parser puts the text under "#text".
  const inner = obj(v)['#text'];
  return typeof inner === 'string' ? inner.trim() : typeof inner === 'number' ? String(inner) : '';
};

/** "24000.00" -> 2400000n without floats. */
function decimalToCents(value: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m?.[1]) return null;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0');
}

/**
 * Parses an ISO 20022 camt.053 bank statement (any 001.0x version) and returns the booked
 * incoming (CRDT) EUR payments. Outgoing payments and other currencies are skipped.
 */
export function parseCamt053(xml: string): BankTransaction[] {
  let root: Xml;
  try {
    root = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@',
      removeNSPrefix: true,
      parseTagValue: false, // keep amounts and references as text
      processEntities: true,
    }).parse(xml) as Xml;
  } catch {
    throw fail('Datoteke ni mogoče prebrati kot XML.');
  }
  const statements = asArray(obj(obj(root.Document).BkToCstmrStmt).Stmt);
  if (statements.length === 0) {
    throw fail('Datoteka ni bančni izpisek v obliki camt.053.');
  }

  const out: BankTransaction[] = [];
  let line = 0;
  for (const stmt of statements) {
    for (const entryRaw of asArray(obj(stmt).Ntry)) {
      line += 1;
      const entry = obj(entryRaw);
      if (text(entry.CdtDbtInd) !== 'CRDT') continue;
      if (text(entry.Sts) !== '' && text(entry.Sts) !== 'BOOK') continue;

      const bookingDate = text(obj(entry.BookgDt).Dt) || text(obj(entry.BookgDt).DtTm).slice(0, 10);
      const details = asArray(obj(entry.NtryDtls).TxDtls);
      // A batched entry lists several payments; otherwise the entry itself is the payment.
      const txs = details.length > 0 ? details : [{}];
      for (const txRaw of txs) {
        const tx = obj(txRaw);
        const amountNode =
          details.length > 1 ? (obj(obj(tx.AmtDtls).TxAmt).Amt ?? tx.Amt) : entry.Amt;
        const currency = text(obj(amountNode)['@Ccy']) || 'EUR';
        const amountCents = decimalToCents(text(amountNode));
        if (currency !== 'EUR' || amountCents === null) continue;

        const rmt = obj(tx.RmtInf);
        const structured = asArray(rmt.Strd).map(obj);
        const structuredRef = structured
          .map((s) => text(obj(s.CdtrRefInf).Ref))
          .find((r) => r !== '');
        const description = [
          ...asArray(rmt.Ustrd).map(text),
          ...structured.map((s) => asArray(s.AddtlRmtInf).map(text).join(' ')),
        ]
          .filter((s) => s !== '')
          .join(' ');
        const endToEnd = text(obj(tx.Refs).EndToEndId);

        out.push({
          line,
          bookingDate: /^\d{4}-\d{2}-\d{2}$/.test(bookingDate) ? bookingDate : null,
          amountCents,
          payerName: text(obj(obj(tx.RltdPties).Dbtr).Nm),
          reference:
            (structuredRef ? compactReference(structuredRef) : null) ??
            findReferenceInText(description) ??
            compactReference(endToEnd),
          description,
          bankReference: text(obj(tx.Refs).AcctSvcrRef) || text(entry.AcctSvcrRef) || null,
        });
      }
    }
  }
  return out;
}

/** Splits one CSV line, honouring double quotes. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else current += ch ?? '';
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(current);
      current = '';
    } else current += ch ?? '';
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

const normalizeHeader = (h: string): string =>
  h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

/** Column names used by Slovenian banks' CSV exports (accents and spacing ignored). */
const COLUMNS = {
  date: ['datumknjizenja', 'datum', 'datumvalute', 'bookingdate', 'date'],
  payer: ['placnik', 'nazivplacnika', 'nalogodajalec', 'partner', 'naziv', 'payer', 'name'],
  purpose: ['namen', 'namenplacila', 'opis', 'description', 'purpose'],
  reference: [
    'sklic',
    'referenca',
    'sklicprejemnika',
    'sklicvdobro',
    'referencaprejemnika',
    'reference',
  ],
  amount: ['znesek', 'dobro', 'vdobro', 'priliv', 'amount', 'credit'],
} as const;

function toIsoDate(value: string): string | null {
  const sl = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/.exec(value);
  if (sl) return `${sl[3]}-${sl[2]?.padStart(2, '0')}-${sl[1]?.padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/**
 * Parses a CSV bank statement export. The first row must be a header; columns are found by
 * name (see COLUMNS), the delimiter (";" or ",") is detected. Only positive amounts are returned.
 */
export function parseStatementCsv(csv: string): BankTransaction[] {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  const headerLine = lines[0];
  if (!headerLine || lines.length < 2) throw fail('Datoteka CSV je prazna.');

  const delimiter =
    (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitCsvLine(headerLine, delimiter).map(normalizeHeader);
  const column = (names: readonly string[]): number => header.findIndex((h) => names.includes(h));
  const idx = {
    date: column(COLUMNS.date),
    payer: column(COLUMNS.payer),
    purpose: column(COLUMNS.purpose),
    reference: column(COLUMNS.reference),
    amount: column(COLUMNS.amount),
  };
  if (idx.amount === -1) {
    throw fail('V datoteki CSV ni stolpca z zneskom (npr. »Znesek« ali »Dobro«).');
  }

  const out: BankTransaction[] = [];
  lines.slice(1).forEach((raw, i) => {
    const cells = splitCsvLine(raw, delimiter);
    const cell = (index: number): string => (index === -1 ? '' : (cells[index] ?? ''));
    const amountText = cell(idx.amount);
    if (amountText.startsWith('-')) return; // outgoing
    const amountCents = parseEuroInput(amountText.replace(/^\+/, ''));
    if (amountCents === null || amountCents === 0n) return;

    const description = cell(idx.purpose);
    out.push({
      line: i + 1,
      bookingDate: toIsoDate(cell(idx.date)),
      amountCents,
      payerName: cell(idx.payer),
      reference: compactReference(cell(idx.reference)) ?? findReferenceInText(description),
      description,
      bankReference: null,
    });
  });
  return out;
}

/** Detects the format from the content and parses it. */
export function parseBankStatement(content: string): BankTransaction[] {
  const head = content
    .replace(/^\uFEFF/, '')
    .trimStart()
    .slice(0, 200);
  return head.startsWith('<') ? parseCamt053(content) : parseStatementCsv(content);
}
