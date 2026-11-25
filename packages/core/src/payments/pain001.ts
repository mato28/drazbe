import { normalizeIban } from '../validation/iban';

/**
 * SEPA credit transfer initiation, ISO 20022 pain.001.001.03 (accepted by Slovenian banks for
 * batch uploads in e-banking). Used for deposit refunds: the debtor account is the estate
 * (debtor's) account — the platform never holds money.
 */
export interface Pain001Payment {
  /** Unique per payment, max 35 chars (we use the deposit sklic). */
  endToEndId: string;
  amountCents: bigint;
  creditorName: string;
  creditorIban: string;
  /** Unstructured remittance information, max 140 chars. */
  remittance: string;
}

export interface Pain001Input {
  /** Unique per file, max 35 chars. */
  messageId: string;
  createdAt: Date;
  /** Requested execution date, YYYY-MM-DD. */
  executionDate: string;
  debtor: { name: string; iban: string; bic?: string | null };
  payments: Pain001Payment[];
}

const TRANSLIT: Record<string, string> = { đ: 'd', Đ: 'D' };

/**
 * Restricts text to the SEPA basic Latin character set (EPC guidance): diacritics are removed
 * ("Kovač" -> "Kovac"), anything else unsupported becomes a space.
 */
export function sepaText(value: string, max: number): string {
  const ascii = value
    .replace(/[đĐ]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ascii.slice(0, max).trim();
}

const escapeXml = (s: string): string =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );

export function formatAmount(cents: bigint): string {
  const whole = cents / 100n;
  const rest = cents % 100n;
  return `${whole.toString()}.${rest.toString().padStart(2, '0')}`;
}

/** ISO date-time without milliseconds (xs:dateTime). */
const isoSeconds = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export function buildPain001(input: Pain001Input): string {
  if (input.payments.length === 0) throw new Error('pain.001 needs at least one payment');
  for (const p of input.payments) {
    if (p.amountCents <= 0n) throw new Error(`payment ${p.endToEndId}: amount must be positive`);
  }
  const total = input.payments.reduce((sum, p) => sum + p.amountCents, 0n);
  const n = String(input.payments.length);
  const id = (s: string) => escapeXml(sepaText(s, 35));
  const text = (s: string, max: number) => escapeXml(sepaText(s, max));
  const agent = input.debtor.bic
    ? `<FinInstnId><BIC>${escapeXml(input.debtor.bic)}</BIC></FinInstnId>`
    : '<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>';

  const transactions = input.payments
    .map(
      (p) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${id(p.endToEndId)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${formatAmount(p.amountCents)}</InstdAmt></Amt>
        <Cdtr><Nm>${text(p.creditorName, 70)}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${normalizeIban(p.creditorIban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${text(p.remittance, 140)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${id(input.messageId)}</MsgId>
      <CreDtTm>${isoSeconds(input.createdAt)}</CreDtTm>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${formatAmount(total)}</CtrlSum>
      <InitgPty><Nm>${text(input.debtor.name, 70)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${id(input.messageId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${formatAmount(total)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${input.executionDate}</ReqdExctnDt>
      <Dbtr><Nm>${text(input.debtor.name, 70)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${normalizeIban(input.debtor.iban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${agent}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${transactions}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
