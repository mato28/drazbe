/**
 * Slovenian payment reference ("sklic"), model SI00: no check digit, the reference is up to
 * 20 digits in at most three hyphen-separated parts (P1-P2-P3).
 *
 * Deposit references are `SI00 <auction number>-<registration number>`, e.g. "SI00 1042-7":
 * unique per bidder + auction, and readable by the trustee on a bank statement.
 */
const SI00 = /^SI00 ?(\d+(?:-\d+){0,2})$/;

/** Canonical display form, with a space after the model: "SI00 1042-7". */
export function buildDepositReference(auctionNumber: number, registrationSeq: number): string {
  if (!Number.isInteger(auctionNumber) || auctionNumber <= 0) {
    throw new Error(`Invalid auction number: ${auctionNumber}`);
  }
  if (!Number.isInteger(registrationSeq) || registrationSeq <= 0) {
    throw new Error(`Invalid registration number: ${registrationSeq}`);
  }
  const reference = `SI00 ${auctionNumber}-${registrationSeq}`;
  if (!isValidSi00Reference(reference)) throw new Error(`Reference too long: ${reference}`);
  return reference;
}

export function isValidSi00Reference(reference: string): boolean {
  const m = SI00.exec(reference.trim().toUpperCase());
  if (!m?.[1]) return false;
  const digits = m[1].replaceAll('-', '');
  return digits.length <= 20;
}

/**
 * Compact form used for comparison and in the UPN QR code: no spaces, upper case
 * ("si00 1042-7" -> "SI001042-7"). Returns null if the text is not an SI00 reference.
 */
export function compactReference(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '').toUpperCase();
  return isValidSi00Reference(cleaned) ? cleaned : null;
}

/** Finds an SI00 reference anywhere in free text (e.g. an unstructured remittance line). */
export function findReferenceInText(text: string): string | null {
  const m = /SI00\s?(\d+(?:-\d+){0,2})/i.exec(text);
  return m?.[1] ? compactReference(`SI00${m[1]}`) : null;
}
