import { renderDocumentPdf } from '@domik/pdf';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { createTestCertificate, signPdf } from './test-signing';

/** Extracts the signatures' ByteRange + PKCS#7 and checks they parse and name the signer. */
function signaturesIn(pdf: Buffer) {
  const text = pdf.toString('latin1');
  return [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map((m) => {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const hex = text.slice(a + b + 1, c - 1).replace(/0+$/, '');
    const p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.hexToBytes(hex.length % 2 ? `${hex}0` : hex)),
    ) as forge.pkcs7.PkcsSignedData;
    const cn = p7.certificates[0]?.subject.getField('CN') as { value: string } | null;
    return { coversTo: c + Number(m[4]), signer: forge.util.decodeUtf8(cn?.value ?? '') };
  });
}

describe('test signing', () => {
  it('signs, then counter-signs incrementally (both signatures kept)', async () => {
    const pdf = await renderDocumentPdf({
      title: 'Pogodba',
      sections: [{ heading: 'Člen 1', paragraphs: ['Test.'] }],
    });
    const buyer = createTestCertificate('Dražitelj Test 2');
    const trustee = createTestCertificate('Test Upravitelj');

    const once = await signPdf(pdf, buyer);
    const twice = await signPdf(once, trustee);
    expect(twice.subarray(0, once.length).equals(once)).toBe(true); // incremental update

    const sigs = signaturesIn(twice);
    expect(sigs.map((s) => s.signer)).toEqual(['Dražitelj Test 2', 'Test Upravitelj']);
    expect(sigs[0]!.coversTo).toBe(once.length);
    expect(sigs[1]!.coversTo).toBe(twice.length);
  }, 60_000);
});
