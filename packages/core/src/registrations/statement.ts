import { AUCTION_TYPE_LABEL, type AuctionType, formatCents, formatDateTime } from '@domik/shared';
import { formatIban } from '../validation/iban';

/** Layout-independent content of a document; rendered to PDF by @domik/pdf. */
export interface DocumentContent {
  title: string;
  subtitle?: string;
  sections: DocumentSection[];
  /** Signature block at the end: left and right signature lines with captions. */
  signature?: { placeAndDate: string; signer: string };
  footer?: string;
}

export interface DocumentSection {
  heading: string;
  /** Label / value pairs. */
  rows?: [string, string][];
  paragraphs?: string[];
  /** Numbered declarations. */
  items?: string[];
  /** A table (e.g. the bid log). Widths are relative weights; header repeats on page breaks. */
  table?: DocumentTable;
}

export interface DocumentTable {
  columns: { label: string; width: number; align?: 'left' | 'right' }[];
  rows: string[][];
  /** Smaller text for wide tables (default: body size). */
  compact?: boolean;
}

export interface StatementInput {
  bidder: {
    type: 'PERSON' | 'COMPANY';
    fullName: string;
    taxId: string;
    address: string;
    companyName: string | null;
    companyRegNo: string | null;
    representativeName: string | null;
    actsAsLegalRepresentative: boolean;
  };
  auction: {
    number: number;
    type: AuctionType;
    startingPriceCents: bigint;
    depositCents: bigint;
    startsAt: Date;
    registrationDeadline: Date;
  };
  lot: { title: string; idZnak: string | null; address: string | null };
  case: { court: string; caseNumber: string; debtorName: string; estateIban: string };
  registration: { pseudonym: string; paymentReference: string };
  /** Auction rules as published (auctionRulesSummary). */
  rules: string[];
}

// LEGAL-REVIEW: wording of the eligibility declaration and the list of excluded persons —
// see docs/legal-review.md.
export const EXCLUDED_PERSONS = [
  'član poslovodstva ali organa nadzora stečajnega dolžnika ali prokurist stečajnega dolžnika v zadnjih dveh letih pred začetkom stečajnega postopka',
  'stečajni upravitelj v tem postopku ali sodnik, ki vodi ta postopek',
  'družbenik stečajnega dolžnika z več kot 10-odstotnim deležem',
  'oseba, ki je z navedenimi osebami povezana (ožji družinski član ali povezana družba)',
] as const;

/**
 * The statement a bidder signs when registering for an auction: who they are, that they are
 * not a person excluded from buying, and that they accept the rules of this auction.
 */
export function buildStatementContent(input: StatementInput): DocumentContent {
  const { bidder: b, auction: a, lot, case: c, registration: r } = input;
  const isCompany = b.type === 'COMPANY';

  const who: [string, string][] = isCompany
    ? [
        ['Pravna oseba', b.companyName ?? ''],
        ['Matična številka', b.companyRegNo ?? ''],
        ['Davčna številka', b.taxId],
        ['Sedež', b.address],
        ['Zakoniti zastopnik', b.representativeName ?? ''],
        [
          'Izjavo podaja',
          b.actsAsLegalRepresentative
            ? `${b.fullName} (zakoniti zastopnik)`
            : `${b.fullName} (po pooblastilu)`,
        ],
      ]
    : [
        ['Ime in priimek', b.fullName],
        ['Davčna številka', b.taxId],
        ['Naslov', b.address],
      ];

  return {
    title: 'Izjava dražitelja',
    subtitle: `Prijava na javno dražbo št. ${a.number}`,
    sections: [
      { heading: 'Dražitelj', rows: who },
      {
        heading: 'Dražba',
        rows: [
          ['Predmet prodaje', lot.title],
          ...(lot.idZnak ? ([['ID znak', lot.idZnak]] as [string, string][]) : []),
          ...(lot.address ? ([['Naslov', lot.address]] as [string, string][]) : []),
          ['Stečajni dolžnik', c.debtorName],
          ['Stečajni postopek', `${c.caseNumber}, ${c.court}`],
          ['Vrsta dražbe', AUCTION_TYPE_LABEL[a.type]],
          ['Izklicna cena', formatCents(a.startingPriceCents)],
          ['Začetek dražbe', formatDateTime(a.startsAt)],
          ['Rok za prijavo', formatDateTime(a.registrationDeadline)],
        ],
      },
      {
        heading: 'Izjavljam',
        items: [
          `da ${isCompany ? 'pravna oseba, ki jo zastopam, ni' : 'nisem'} oseba, ki po zakonu, ki ureja finančno poslovanje, postopke zaradi insolventnosti in prisilno prenehanje (ZFPPIPP), ne more biti kupec premoženja stečajnega dolžnika, in sicer ${isCompany ? 'ni' : 'nisem'}: ${EXCLUDED_PERSONS.join('; ')};`,
          'da sem seznanjen s pravnim in dejanskim stanjem predmeta prodaje, z objavljeno dokumentacijo ter s tem, da se predmet prodaja po načelu videno–kupljeno;',
          'da sem seznanjen s pravili te dražbe, navedenimi v nadaljevanju, in jih v celoti sprejemam;',
          'da so ponudbe, ki jih bom oddal na dražbi, zavezujoče in jih ne morem preklicati;',
          `da bom varščino ${formatCents(a.depositCents)} plačal na račun stečajnega dolžnika ${formatIban(c.estateIban)} s sklicem ${r.paymentReference} do roka za prijavo;`,
          'da so podatki v tej izjavi resnični in popolni.',
        ],
      },
      { heading: 'Pravila dražbe', items: input.rules },
    ],
    signature: {
      placeAndDate: 'Kraj in datum',
      signer: isCompany ? 'Podpis zastopnika in žig (če se uporablja)' : 'Podpis dražitelja',
    },
    footer: `Izjava za dražbo št. ${a.number} · ${r.pseudonym} · sklic ${r.paymentReference} · Podpisano izjavo (lastnoročno podpisano in skenirano ali elektronsko podpisano) naložite na strani prijave.`,
  };
}
