import { buildStatementContent, type DocumentContent } from '@domik/core';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { renderDocumentPdf } from './render';

const statement = buildStatementContent({
  bidder: {
    type: 'COMPANY',
    fullName: 'Peter Kralj',
    taxId: '12345679',
    address: 'Tržaška cesta 2, 2000 Maribor',
    companyName: 'Nepremičnine Kovač d.o.o.',
    companyRegNo: '7654321000',
    representativeName: 'Maja Kovač',
    actsAsLegalRepresentative: false,
  },
  auction: {
    number: 1042,
    type: 'ASCENDING',
    startingPriceCents: 24_000_000n,
    depositCents: 2_400_000n,
    startsAt: new Date('2026-12-07T09:00:00Z'),
    registrationDeadline: new Date('2026-12-03T09:00:00Z'),
  },
  lot: {
    title: 'Poslovni prostor v pritličju, Maribor – center',
    idZnak: '657-1201-3',
    address: 'Primerna cesta 4, 2000 Maribor',
  },
  case: {
    court: 'Okrožno sodišče v Ljubljani',
    caseNumber: 'St 1234/2026',
    debtorName: 'Gradbeništvo Primer d.o.o. - v stečaju',
    estateIban: 'SI56051008012340041',
  },
  registration: { pseudonym: 'Dražitelj 7', paymentReference: 'SI00 1042-7' },
  rules: [
    'Dražba poteka z zviševanjem izklicne cene.',
    'Ponudbe so zavezujoče in jih ni mogoče preklicati.',
  ],
});

describe('renderDocumentPdf', () => {
  it('renders the bidder statement as a valid one-page A4 PDF', async () => {
    const bytes = await renderDocumentPdf(statement);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(pdf.getTitle()).toBe('Izjava dražitelja');
    expect(bytes.byteLength).toBeLessThan(200_000);
  });

  it('is deterministic for the same content', async () => {
    const a = await renderDocumentPdf(statement);
    const b = await renderDocumentPdf(statement);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('flows long content onto further pages', async () => {
    const long: DocumentContent = {
      title: 'Dolg dokument',
      sections: [
        {
          heading: 'Točke',
          items: Array.from(
            { length: 120 },
            (_, i) =>
              `Točka ${i + 1}: čšž ČŠŽ đ ć – besedilo, ki se prelomi v več vrstic, da preverimo prelom strani in oštevilčenje.`,
          ),
        },
      ],
      signature: { placeAndDate: 'Kraj in datum', signer: 'Podpis' },
      footer: 'Noga dokumenta',
    };
    const pdf = await PDFDocument.load(await renderDocumentPdf(long));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  it('does not fail on characters the font lacks', async () => {
    const bytes = await renderDocumentPdf({
      title: 'Emoji 😀 in 漢字',
      sections: [{ heading: 'A', paragraphs: ['ok ✓'] }],
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
