/**
 * DEVELOPMENT / TESTS ONLY: signs PDFs with a self-signed test certificate so the signing
 * flow and DSS validation can be exercised without a real qualified certificate. DSS reports
 * such signatures as INDETERMINATE / NO_CERTIFICATE_CHAIN_FOUND (cryptographically intact,
 * certificate not trusted), which only the development signature policy accepts.
 */
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';

export interface TestCertificate {
  p12: Buffer;
  passphrase: string;
  commonName: string;
}

/** A self-signed signing certificate for `commonName` (RSA 2048, 1 year). */
export function createTestCertificate(commonName: string): TestCertificate {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(8))}`;
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  // UTF8String: names with č, š, ž are not valid PrintableString.
  const attrs = [
    {
      name: 'commonName',
      value: commonName,
      valueTagClass: forge.asn1.Type.UTF8 as unknown as forge.asn1.Class,
    },
    { name: 'countryName', value: 'SI' },
    { name: 'organizationName', value: 'Domik TEST (not a real certificate)' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const passphrase = 'test';
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
    algorithm: '3des',
  });
  return {
    p12: Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'),
    passphrase,
    commonName,
  };
}

/** Rewrites a PDF with a classic xref table (needed for incremental signing). */
export async function normalizePdf(pdf: Uint8Array): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

const hasSignature = (pdf: Buffer): boolean => pdf.includes('/ByteRange');

/**
 * Adds a signature as an incremental update, so an already signed PDF can be counter-signed
 * without invalidating the first signature (buyer signs, then the trustee).
 */
export async function signPdf(pdf: Uint8Array, cert: TestCertificate): Promise<Buffer> {
  const input = Buffer.from(pdf);
  const base = hasSignature(input) ? input : await normalizePdf(input);
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: base,
    reason: 'Podpis prodajne pogodbe (TEST)',
    contactInfo: 'test@domik.local',
    name: cert.commonName,
    location: 'Ljubljana',
    signatureLength: 16_384,
  });
  const signer = new P12Signer(cert.p12, { passphrase: cert.passphrase });
  return new SignPdf().sign(withPlaceholder, signer);
}
