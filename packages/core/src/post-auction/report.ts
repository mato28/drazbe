import type { AuditLogRow, BidWithPseudonym, DocumentRow } from '@domik/db';
import {
  AUCTION_STATUS_LABEL,
  AUCTION_TYPE_LABEL,
  BID_KIND_LABEL,
  formatCents,
  formatDateTime,
} from '@domik/shared';
import { configOf } from '../auctions/service';
import { verifyAuction, type AuctionVerification } from '../bidding/verify';
import { genesisHash } from '../bidding/hash';
import { type ServiceContext } from '../context';
import { storeGeneratedDocument } from '../documents/service';
import { auctionRulesSummary } from '../public/rules';
import { type DocumentContent, type DocumentSection } from '../registrations/statement';

const stamp = new Intl.DateTimeFormat('sl-SI', {
  timeZone: 'Europe/Ljubljana',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
});
/** Server time with milliseconds, Europe/Ljubljana. */
export const formatTimestamp = (d: Date): string => stamp.format(d);

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const field = (obj: unknown, key: string): unknown =>
  obj && typeof obj === 'object' && key in obj ? (obj as Record<string, unknown>)[key] : undefined;

export interface ReportParticipant {
  registrationId: string;
  pseudonym: string;
  name: string;
  taxId: string;
  address: string;
  isPreemptionHolder: boolean;
  preemptionRank: number | null;
}

export interface AuctionReportData {
  auction: Awaited<ReturnType<ServiceContext['uow']['repos']['auctions']['findById']>> & {};
  lot: {
    title: string;
    address: string | null;
    idZnak: string | null;
    cadastralMunicipality: string | null;
    parcelNumber: string | null;
    areaM2: string | null;
  };
  case: { court: string; caseNumber: string; debtorName: string };
  trusteeName: string;
  participants: ReportParticipant[];
  bids: BidWithPseudonym[];
  history: AuditLogRow[];
  verification: AuctionVerification;
  generatedAt: Date;
}

/** Phase changes and extensions, in order, from the audit log. */
export function reportEvents(history: AuditLogRow[]): [string, string][] {
  const events: [string, string][] = [];
  for (const e of history) {
    const at = formatTimestamp(e.at);
    switch (e.action) {
      case 'auction.published':
        events.push([at, 'Dražba objavljena']);
        break;
      case 'auction.registration_closed':
        events.push([at, 'Rok za prijave potekel']);
        break;
      case 'auction.started':
        events.push([at, 'Začetek dražbe']);
        break;
      case 'auction.price_step': {
        const price = str(field(e.after, 'currentPriceCents'));
        events.push([at, `Znižanje cene na ${price ? formatCents(price) : '?'}`]);
        break;
      }
      case 'bid.bid':
      case 'bid.accept':
      case 'bid.preemption_match': {
        const before = str(field(e.before, 'endsAt'));
        const after = str(field(e.after, 'endsAt'));
        if (e.action === 'bid.accept') {
          events.push([at, `Sprejem cene (ponudba št. ${String(field(e.after, 'seq'))})`]);
        }
        if (e.action === 'bid.preemption_match') {
          events.push([
            at,
            `Uveljavitev predkupne pravice (ponudba št. ${String(field(e.after, 'seq'))})`,
          ]);
        }
        if (after && before !== after) {
          events.push([
            at,
            before
              ? `Podaljšanje dražbe do ${formatTimestamp(new Date(after))} (ponudba št. ${String(field(e.after, 'seq'))})`
              : `Nadaljevanje z zviševanjem do ${formatTimestamp(new Date(after))}`,
          ]);
        }
        break;
      }
      case 'auction.preemption_opened': {
        const until = str(field(e.after, 'preemptionEndsAt'));
        events.push([
          at,
          `Začetek faze predkupne pravice${until ? ` (do ${formatTimestamp(new Date(until))})` : ''}`,
        ]);
        break;
      }
      case 'auction.awarded':
        events.push([
          at,
          `Konec dražbe – najvišja ponudba: ${String(field(e.after, 'winnerPseudonym'))}`,
        ]);
        break;
      case 'auction.unsuccessful':
        events.push([at, `Dražba neuspešna: ${str(field(e.after, 'reason')) ?? ''}`]);
        break;
      case 'auction.stopped':
      case 'auction.cancelled':
        events.push([
          at,
          `${e.action === 'auction.stopped' ? 'Dražbo ustavil' : 'Dražbo preklical'} upravitelj: ${str(field(e.after, 'reason')) ?? ''}`,
        ]);
        break;
      default:
        break;
    }
  }
  return events;
}

// LEGAL-REVIEW: content of the zapisnik o dražbi and of its public version — see docs/legal-review.md
/**
 * The auction report (zapisnik o dražbi). `withIdentities`: the full version for the trustee /
 * court maps pseudonyms to bidders; the public version shows pseudonyms only.
 */
export function buildAuctionReport(d: AuctionReportData, withIdentities: boolean): DocumentContent {
  const a = d.auction;
  const byReg = new Map(d.participants.map((p) => [p.registrationId, p]));
  const winner = a.leadingRegistrationId ? byReg.get(a.leadingRegistrationId) : undefined;
  const who = (p: ReportParticipant | undefined, pseudonym: string) =>
    withIdentities && p ? `${pseudonym} – ${p.name}` : pseudonym;
  const rules = auctionRulesSummary(configOf(a));

  const sections: DocumentSection[] = [
    {
      heading: 'Stečajni postopek',
      rows: [
        ['Sodišče', d.case.court],
        ['Opravilna številka', d.case.caseNumber],
        ['Stečajni dolžnik', d.case.debtorName],
        ['Stečajni upravitelj', d.trusteeName],
        ['Soglasje sodišča k prodaji', a.courtApprovalRef ?? '—'],
      ],
    },
    {
      heading: 'Predmet prodaje',
      rows: [
        ['Naziv', d.lot.title],
        ['Naslov', d.lot.address ?? '—'],
        ['ID znak', d.lot.idZnak ?? '—'],
        ['Katastrska občina', d.lot.cadastralMunicipality ?? '—'],
        ['Parcela', d.lot.parcelNumber ?? '—'],
        ['Površina', d.lot.areaM2 ? `${d.lot.areaM2.replace('.', ',')} m²` : '—'],
      ],
    },
    {
      heading: 'Pogoji dražbe',
      rows: [
        ['Številka dražbe', String(a.number)],
        ['Vrsta', AUCTION_TYPE_LABEL[a.type]],
        ['Izklicna cena', formatCents(a.startingPriceCents)],
        ['Varščina', formatCents(a.depositCents)],
        ['Objavljena', a.publishedAt ? formatDateTime(a.publishedAt) : '—'],
        ['Rok za prijavo', formatDateTime(a.registrationDeadline)],
        ['Začetek', formatDateTime(a.startsAt)],
      ],
      items: rules,
    },
    {
      heading: 'Udeleženci',
      ...(withIdentities
        ? {
            table: {
              compact: true,
              columns: [
                { label: 'Oznaka', width: 1.2 },
                { label: 'Dražitelj', width: 2.4 },
                { label: 'Davčna št.', width: 1 },
                { label: 'Naslov', width: 2.6 },
                { label: 'Predkupni upr.', width: 1 },
              ],
              rows: d.participants.map((p) => [
                p.pseudonym,
                p.name,
                p.taxId,
                p.address,
                p.isPreemptionHolder ? `da (${String(p.preemptionRank)})` : 'ne',
              ]),
            },
          }
        : {
            paragraphs: [
              `Na dražbi je sodelovalo ${String(d.participants.length)} potrjenih dražiteljev (${
                d.participants
                  .map(
                    (p) => p.pseudonym + (p.isPreemptionHolder ? ' – predkupni upravičenec' : ''),
                  )
                  .join(', ') || '—'
              }). Identitete dražiteljev so navedene v zapisniku, ki ga hrani stečajni upravitelj.`,
            ],
          }),
    },
    {
      heading: 'Potek dražbe (strežniški čas, Europe/Ljubljana)',
      rows: reportEvents(d.history),
    },
    {
      heading: `Ponudbe (${String(d.bids.length)})`,
      ...(d.bids.length === 0
        ? { paragraphs: ['Na dražbi ni bila oddana nobena ponudba.'] }
        : {
            table: {
              compact: true,
              columns: [
                { label: 'Št.', width: 0.5, align: 'right' as const },
                { label: 'Čas strežnika', width: 2 },
                { label: 'Dražitelj', width: withIdentities ? 3 : 1.4 },
                { label: 'Vrsta', width: 1.3 },
                { label: 'Znesek', width: 1.5, align: 'right' as const },
              ],
              rows: d.bids.map((b) => [
                String(b.seq),
                formatTimestamp(b.serverTime),
                who(byReg.get(b.registrationId), b.pseudonym),
                BID_KIND_LABEL[b.kind],
                formatCents(b.amountCents),
              ]),
            },
          }),
    },
    {
      heading: 'Zgoščene vrednosti (SHA-256)',
      paragraphs: [
        'hash = sha256(prejšnji hash | id dražbe | oznaka dražitelja | znesek v centih | čas strežnika ISO | zaporedna št.). Prva ponudba se veže na sha256(id dražbe). Vsaka sprememba, izbris ali vrinjenje ponudbe spremeni vse naslednje vrednosti.',
      ],
      table: {
        compact: true,
        columns: [
          { label: 'Št.', width: 0.5, align: 'right' },
          { label: 'Zgoščena vrednost', width: 7 },
        ],
        rows: [['0', genesisHash(a.id)], ...d.bids.map((b) => [String(b.seq), b.hash])],
      },
    },
    {
      heading: 'Preverjanje celovitosti',
      rows: [
        ['Končna zgoščena vrednost', d.verification.headHash],
        [
          'Preverjanje verige',
          d.verification.valid
            ? `Brez napak (${String(d.verification.bidCount)} ponudb), preverjeno ${formatTimestamp(d.generatedAt)}`
            : `NAPAKA: ${d.verification.problems.map((p) => `št. ${String(p.seq)}: ${p.problem}`).join('; ') || 'neskladje cene'}`,
        ],
      ],
    },
    {
      heading: 'Izid',
      rows: [
        ['Stanje', AUCTION_STATUS_LABEL[a.status]],
        ...(a.status === 'ENDED'
          ? ([
              [
                'Najvišja ponudba',
                a.currentPriceCents !== null ? formatCents(a.currentPriceCents) : '—',
              ],
              ['Najugodnejši dražitelj', winner ? who(winner, winner.pseudonym) : '—'],
            ] as [string, string][])
          : []),
        ['Zaključek', a.closedAt ? formatTimestamp(a.closedAt) : '—'],
        ...(a.closedReason ? ([['Razlog', a.closedReason]] as [string, string][]) : []),
      ],
    },
  ];

  return {
    title: `Zapisnik o javni dražbi št. ${String(a.number)}`,
    subtitle: `${d.lot.title}${withIdentities ? '' : ' · javna različica (brez identitet dražiteljev)'}`,
    sections,
    footer: `Zapisnik je samodejno izdelala platforma Domik ${formatTimestamp(d.generatedAt)} iz nespremenljivega dnevnika ponudb. Zgoščena vrednost (SHA-256) te datoteke je shranjena ob dokumentu.`,
  };
}

async function loadReportData(
  ctx: Pick<ServiceContext, 'uow' | 'clock'>,
  auctionId: string,
): Promise<AuctionReportData | null> {
  const { repos } = ctx.uow;
  const row = await repos.auctions.findWithLotAndCase(auctionId);
  if (!row) return null;
  const { lot: lotWithCase, ...auction } = row;
  const trustee = await repos.trustees.findById(lotWithCase.case.trusteeId);
  const [registrations, bids, history, verification] = await Promise.all([
    repos.auctionRegistrations.listByAuctionWithBidder(auctionId),
    repos.bids.listByAuctionWithPseudonym(auctionId),
    repos.auditLog.listForEntity('auction', auctionId),
    verifyAuction(ctx, auctionId),
  ]);
  if (!verification) return null;
  return {
    auction,
    lot: lotWithCase,
    case: lotWithCase.case,
    trusteeName: trustee?.firmName ? `${trustee.name}, ${trustee.firmName}` : (trustee?.name ?? ''),
    participants: registrations
      .filter(({ registration: r }) => r.status === 'APPROVED')
      .map(({ registration: r, bidder: b }) => ({
        registrationId: r.id,
        pseudonym: r.pseudonym,
        name:
          b.type === 'COMPANY' && b.companyName
            ? `${b.companyName} (zastopa ${b.fullName})`
            : b.fullName,
        taxId: b.taxId,
        address: b.address,
        isPreemptionHolder: r.isPreemptionHolder,
        preemptionRank: r.preemptionRank,
      })),
    bids,
    history,
    verification,
    generatedAt: ctx.clock.now(),
  };
}

export type ReportContext = Pick<ServiceContext, 'uow' | 'clock' | 'storage' | 'pdf'>;

/**
 * Renders and stores both versions of the auction report (full + public), each with its
 * SHA-256. Idempotent: does nothing if the full report already exists. Called by the worker.
 */
export async function generateAuctionReports(
  ctx: ReportContext,
  auctionId: string,
): Promise<{ full: DocumentRow; public: DocumentRow } | null> {
  const existing = await ctx.uow.repos.documents.listByOwner('AUCTION', auctionId);
  if (existing.some((d) => d.kind === 'AUCTION_REPORT')) return null;
  const data = await loadReportData(ctx, auctionId);
  if (!data) return null;

  const number = String(data.auction.number);
  const store = async (withIdentities: boolean) =>
    storeGeneratedDocument(ctx, null, {
      ownerType: 'AUCTION',
      ownerId: auctionId,
      kind: withIdentities ? 'AUCTION_REPORT' : 'AUCTION_REPORT_PUBLIC',
      filename: `zapisnik-drazba-${number}${withIdentities ? '' : '-javni'}.pdf`,
      bytes: await ctx.pdf.render(buildAuctionReport(data, withIdentities)),
      mime: 'application/pdf',
      extension: 'pdf',
      keyPrefix: `auctions/${auctionId}`,
    });
  // Public first: the full report's existence marks the job as done.
  const pub = await store(false);
  const full = await store(true);
  return { full, public: pub };
}
