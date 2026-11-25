import {
  auctionService,
  descendingSchedule,
  formatIban,
  getAuctionOutcome,
  getTrusteePostAuction,
  registrationService,
} from '@domik/core';
import {
  AUCTION_TYPE_LABEL,
  BID_KIND_LABEL,
  formatCents,
  formatDateTime,
  SALE_STATUS_LABEL,
  type SignatureCheckDto,
} from '@domik/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RefundPanel } from '@/components/post-auction/refund-panel';
import { SignatureCheckView } from '@/components/post-auction/signature-check';
import { TrusteeSalePanel } from '@/components/post-auction/trustee-sale-panel';
import { AuctionActions } from '@/components/trustee/auction-actions';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Section } from '@/components/trustee/page-header';
import { DepositBadge, IdentityBadge, RegistrationBadge } from '@/components/status-badges';
import { AuctionStatusBadge } from '@/components/trustee/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { serviceContext } from '@/server/services';
import { load, pageId, trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Dražba' };

const ACTION_LABEL: Record<string, string> = {
  'auction.created': 'Osnutek ustvarjen',
  'auction.updated': 'Osnutek spremenjen',
  'auction.published': 'Dražba objavljena',
  'auction.cancelled': 'Dražba preklicana',
  'auction.stopped': 'Dražba ustavljena',
  'auction.registration_closed': 'Rok za prijave potekel',
  'auction.started': 'Začetek dražbe',
  'auction.price_step': 'Znižanje cene',
  'auction.preemption_opened': 'Začetek faze predkupne pravice',
  'auction.awarded': 'Konec dražbe – izbran najugodnejši dražitelj',
  'auction.unsuccessful': 'Dražba neuspešna',
  'auction.settled': 'Obdelava po koncu dražbe (varščine, obvestila)',
  'bid.bid': 'Ponudba',
  'bid.accept': 'Sprejem cene',
  'bid.preemption_match': 'Uveljavitev predkupne pravice',
  'deposit.refund_order_created': 'Pripravljen nalog za vračilo varščin',
};

const CLOSED = ['ENDED', 'UNSUCCESSFUL', 'CANCELLED'];
const HAS_OUTCOME = ['LIVE', 'PREEMPTION', ...CLOSED];
const LIVE_ROOM = ['REGISTRATION_CLOSED', 'LIVE', 'PREEMPTION', 'ENDED'];

const docHref = (id: string) => `/api/documents/${id}`;

function DocLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a href={docHref(id)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  );
}

function amountOf(after: unknown): string | null {
  if (after && typeof after === 'object' && 'amountCents' in after) {
    return typeof after.amountCents === 'string' ? formatCents(after.amountCents) : null;
  }
  return null;
}

function duration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = sec / 60;
  return Number.isInteger(min) ? `${min} min` : `${sec} s`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,14rem)_1fr] gap-3 px-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function reasonOf(after: unknown): string | null {
  if (after && typeof after === 'object' && 'reason' in after && typeof after.reason === 'string') {
    return after.reason;
  }
  return null;
}

export default async function AuctionPage({ params }: { params: Promise<{ auctionId: string }> }) {
  const actor = await trusteeActor();
  const auctionId = await pageId(params, 'auctionId');
  const ctx = serviceContext();
  const {
    auction: a,
    lot,
    case: c,
    history,
  } = await load(() => auctionService.getAuction(ctx, actor, auctionId));
  const registrations =
    a.status === 'DRAFT'
      ? []
      : await registrationService.listAuctionRegistrations(ctx, actor, auctionId);
  const schedule = descendingSchedule(auctionService.configOf(a));
  const outcome = HAS_OUTCOME.includes(a.status)
    ? await getAuctionOutcome(ctx, actor, auctionId)
    : null;
  const post = a.settledAt ? await getTrusteePostAuction(ctx, actor, auctionId) : null;
  const sale = post?.sale ?? null;
  const now = new Date();
  const ascendingPhase = a.type === 'ASCENDING' || a.switchToAscendingOnAccept;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lot.title} <AuctionStatusBadge status={a.status} />
          </span>
        }
        subtitle={`${AUCTION_TYPE_LABEL[a.type]} · ${c.caseNumber}`}
        back={{ href: `/upravitelj/predmeti/${lot.id}`, label: 'Predmet prodaje' }}
        actions={
          a.status === 'DRAFT' ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/upravitelj/drazbe/${a.id}/uredi`}>Uredi osnutek</Link>
            </Button>
          ) : (
            LIVE_ROOM.includes(a.status) && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/drazbe/${a.id}/v-zivo`}>Dražba v živo</Link>
              </Button>
            )
          )
        }
      />

      {a.closedReason && (
        <Alert variant={a.status === 'CANCELLED' ? 'destructive' : 'warning'} className="mb-4">
          <span className="font-medium">Razlog:</span> {a.closedReason}
          {a.closedAt && <span> ({formatDateTime(a.closedAt)})</span>}
        </Alert>
      )}

      <AuctionActions
        auctionId={a.id}
        status={a.status}
        publishBlockedReason={lot.isAgricultural ? auctionService.AGRICULTURAL_NOT_SUPPORTED : null}
      />

      {outcome && (
        <Section title="Izid dražbe">
          <dl className="mb-3 divide-y rounded-lg border">
            <Row label={outcome.status === 'ENDED' ? 'Najugodnejši dražitelj' : 'Trenutno vodi'}>
              {outcome.leader ? (
                <>
                  <span className="font-medium">{outcome.leader.name}</span>{' '}
                  <span className="text-muted-foreground">({outcome.leader.pseudonym})</span>
                </>
              ) : (
                '—'
              )}
            </Row>
            <Row label={outcome.status === 'ENDED' ? 'Dosežena cena' : 'Trenutna cena'}>
              {outcome.priceCents !== null ? formatCents(outcome.priceCents) : '—'}
            </Row>
            {outcome.closedAt && <Row label="Zaključek">{formatDateTime(outcome.closedAt)}</Row>}
            <Row label="Celovitost dnevnika ponudb">
              {outcome.verification.valid && outcome.verification.priceConsistent ? (
                <Badge variant="success">Veriga zgoščenih vrednosti je nespremenjena</Badge>
              ) : (
                <Badge variant="destructive">Napaka v verigi ponudb – preverite takoj</Badge>
              )}
            </Row>
            {post && (
              <Row label="Zapisnik o dražbi">
                {post.reports.full ? (
                  <span className="grid gap-1">
                    <DocLink id={post.reports.full.id}>Zapisnik (z identitetami)</DocLink>
                    {post.reports.public && (
                      <DocLink id={post.reports.public.id}>
                        Javna različica (brez identitet)
                      </DocLink>
                    )}
                    <span className="font-mono text-xs break-all text-muted-foreground">
                      SHA-256 {post.reports.full.sha256}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Zapisnik se pripravlja …</span>
                )}
              </Row>
            )}
          </dl>
          {outcome.bids.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-right">Št.</th>
                    <th className="px-3 py-2">Čas strežnika</th>
                    <th className="px-3 py-2">Dražitelj</th>
                    <th className="px-3 py-2">Vrsta</th>
                    <th className="px-3 py-2 text-right">Znesek</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...outcome.bids].reverse().map((b) => (
                    <tr key={b.seq}>
                      <td className="px-3 py-2 text-right tabular-nums">{b.seq}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateTime(b.serverTime)}
                      </td>
                      <td className="px-3 py-2">
                        {b.name} <span className="text-muted-foreground">({b.pseudonym})</span>
                      </td>
                      <td className="px-3 py-2">{BID_KIND_LABEL[b.kind]}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCents(b.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {sale && (
        <Section title="Prodaja">
          <dl className="mb-3 divide-y rounded-lg border">
            <Row label="Stanje">
              <Badge
                variant={
                  sale.sale.status === 'DEFAULTED'
                    ? 'destructive'
                    : sale.sale.status === 'REGISTERED'
                      ? 'success'
                      : 'secondary'
                }
              >
                {SALE_STATUS_LABEL[sale.sale.status]}
              </Badge>
              {sale.sale.signedOnPaper && (
                <span className="ml-2 text-muted-foreground">podpisano na papirju</span>
              )}
            </Row>
            <Row label="Kupec">
              {sale.buyerName}
              <div className="text-xs text-muted-foreground">
                podpisnik (ime v kvalificiranem potrdilu): {sale.buyerSignerName}
              </div>
            </Row>
            <Row label="Kupnina">{formatCents(sale.amounts.priceCents)}</Row>
            <Row label="Všteta varščina">{formatCents(sale.amounts.depositAppliedCents)}</Row>
            <Row label="Doplačilo are">{formatCents(sale.amounts.downPaymentDueCents)}</Row>
            <Row label="Preostanek kupnine">{formatCents(sale.amounts.remainderCents)}</Row>
            {sale.deadline && (
              <Row label="Naslednji rok">
                <span className={sale.deadline.at < now ? 'font-medium text-destructive' : ''}>
                  {sale.deadline.task} do {formatDateTime(sale.deadline.at)}
                  {sale.deadline.at < now && ' – rok je potekel'}
                </span>
              </Row>
            )}
            {sale.sale.contractSignedAt && (
              <Row label="Pogodba sklenjena">{formatDateTime(sale.sale.contractSignedAt)}</Row>
            )}
            {sale.sale.downPaymentPaidAt && (
              <Row label="Ara plačana">{formatDateTime(sale.sale.downPaymentPaidAt)}</Row>
            )}
            {sale.sale.pricePaidAt && (
              <Row label="Kupnina plačana">{formatDateTime(sale.sale.pricePaidAt)}</Row>
            )}
            {sale.sale.transferProposedAt && (
              <Row label="Predlog za sklep o izročitvi">
                {formatDateTime(sale.sale.transferProposedAt)}
              </Row>
            )}
            {sale.sale.transferOrderIssuedAt && (
              <Row label="Sklep o izročitvi">
                {sale.sale.transferOrderRef} · {formatDateTime(sale.sale.transferOrderIssuedAt)}
              </Row>
            )}
            {sale.sale.registeredAt && (
              <Row label="Vpis v zemljiško knjigo">
                {sale.sale.registrationRef} · {formatDateTime(sale.sale.registeredAt)}
              </Row>
            )}
            {sale.sale.defaultReason && <Row label="Neizpolnitev">{sale.sale.defaultReason}</Row>}
            {sale.contract && (
              <Row label="Pogodba (nepodpisana)">
                <DocLink id={sale.contract.id}>{sale.contract.filename}</DocLink>
              </Row>
            )}
            {sale.buyerSigned && (
              <Row label="Podpisal kupec">
                <div className="grid gap-2">
                  <DocLink id={sale.buyerSigned.id}>{sale.buyerSigned.filename}</DocLink>
                  {sale.buyerSignatureCheck && (
                    <SignatureCheckView check={sale.buyerSignatureCheck as SignatureCheckDto} />
                  )}
                </div>
              </Row>
            )}
            {sale.signed && (
              <Row label={sale.sale.signedOnPaper ? 'Sken podpisane pogodbe' : 'Podpisana pogodba'}>
                <div className="grid gap-2">
                  <DocLink id={sale.signed.id}>{sale.signed.filename}</DocLink>
                  {sale.signedCheck && (
                    <SignatureCheckView check={sale.signedCheck as SignatureCheckDto} />
                  )}
                </div>
              </Row>
            )}
          </dl>
          <TrusteeSalePanel
            auctionId={a.id}
            status={sale.sale.status}
            hasContract={sale.contract !== null}
            buyerSigned={sale.buyerSigned !== null}
            downPaymentCents={sale.sale.downPaymentCents.toString()}
            downPaymentDays={sale.sale.downPaymentDays}
            priceDays={sale.sale.priceDays}
            nextSteps={sale.nextSteps}
            canDeclareDefault={sale.deadline !== null && sale.deadline.at <= now}
          />
        </Section>
      )}

      {post && post.deposits.length > 0 && (
        <Section title="Varščine">
          <RefundPanel
            auctionId={a.id}
            rows={post.deposits.map((d) => ({
              registrationId: d.registrationId,
              pseudonym: d.pseudonym,
              name: d.name,
              depositStatus: d.depositStatus,
              refundIban: d.refundIban,
              inOrder: d.refundOrderDocId !== null,
              refundedAt: d.refundedAt?.toISOString() ?? null,
            }))}
          />
          {post.refundOrders.length > 0 && (
            <ul className="mt-3 grid gap-1 text-sm">
              {post.refundOrders.map((d) => (
                <li key={d.id}>
                  Nalog SEPA: <DocLink id={d.id}>{d.filename}</DocLink>{' '}
                  <span className="text-muted-foreground">({formatDateTime(d.createdAt)})</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {a.status !== 'DRAFT' && (
        <Section title={`Prijave dražiteljev (${registrations.length})`}>
          {registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Na dražbo se še ni prijavil noben dražitelj.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {registrations.map(({ registration: r, bidder }) => (
                <li key={r.id}>
                  <Link
                    href={`/upravitelj/prijave/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent"
                  >
                    <div>
                      <div className="font-medium">
                        {bidder.type === 'COMPANY' && bidder.companyName
                          ? bidder.companyName
                          : bidder.fullName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {r.pseudonym} · sklic {r.paymentReference}
                        {r.isPreemptionHolder && ` · predkupni upravičenec (${r.preemptionRank})`}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      Identiteta <IdentityBadge status={bidder.status} />
                      Varščina <DepositBadge status={r.depositStatus} />
                      Prijava <RegistrationBadge status={r.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Parametri dražbe">
        <dl className="divide-y rounded-lg border">
          <Row label="Številka dražbe">{a.number}</Row>
          <Row label="Izklicna cena">{formatCents(a.startingPriceCents)}</Row>
          {a.type === 'DESCENDING' && (
            <>
              <Row label="Najnižja cena">
                {a.floorPriceCents !== null && formatCents(a.floorPriceCents)}
              </Row>
              <Row label="Korak zniževanja">
                {a.priceDecrementCents !== null && formatCents(a.priceDecrementCents)}
                {a.stepDurationSec !== null && ` vsakih ${duration(a.stepDurationSec)}`}
              </Row>
              {schedule && (
                <Row label="Potek zniževanja">
                  {schedule.steps} cenovnih stopenj; brez sprejema se dražba konča{' '}
                  {formatDateTime(schedule.endsAt)}
                </Row>
              )}
              <Row label="Po prvem sprejemu cene">
                {a.switchToAscendingOnAccept
                  ? 'Dražba se nadaljuje z zviševanjem'
                  : 'Dražba je končana'}
              </Row>
            </>
          )}
          {ascendingPhase && (
            <Row label="Korak draženja">
              {a.bidIncrementCents !== null && formatCents(a.bidIncrementCents)}
            </Row>
          )}
          <Row label="Varščina">{formatCents(a.depositCents)}</Row>
          <Row label="Rok za prijavo in varščino">{formatDateTime(a.registrationDeadline)}</Row>
          <Row label="Začetek dražbe">{formatDateTime(a.startsAt)}</Row>
          {a.endsAt && <Row label="Konec dražbe">{formatDateTime(a.endsAt)}</Row>}
          {ascendingPhase && (
            <Row label="Podaljševanje">
              {a.extensionWindowSec === 0
                ? 'Brez podaljševanja'
                : `Ponudba v zadnjih ${duration(a.extensionWindowSec)} podaljša dražbo za ${duration(a.extensionSec)}`}
            </Row>
          )}
          <Row label="Predkupna pravica">
            {a.preemptionEnabled
              ? `Da, rok za uveljavitev ${duration(a.preemptionWindowSec)}`
              : 'Ne'}
          </Row>
          <Row label="Soglasje sodišča k prodaji">
            {a.courtApprovalRef ?? <span className="text-destructive">Ni vneseno</span>}
          </Row>
          <Row label="Račun za varščino in kupnino">
            <span className="font-mono">{formatIban(c.estateIban)}</span> · {c.estateBank}
          </Row>
          {a.publishedAt && <Row label="Objavljeno">{formatDateTime(a.publishedAt)}</Row>}
        </dl>
      </Section>

      <Section title="Revizijska sled">
        <ol className="divide-y rounded-lg border">
          {history.map((entry) => {
            const reason = reasonOf(entry.after);
            const amount = entry.action.startsWith('bid.') ? amountOf(entry.after) : null;
            return (
              <li key={entry.id.toString()} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {ACTION_LABEL[entry.action] ?? entry.action}
                    {amount && <span className="font-normal"> · {amount}</span>}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(entry.at)}</span>
                </div>
                {reason && <div className="text-muted-foreground">Razlog: {reason}</div>}
              </li>
            );
          })}
        </ol>
      </Section>
    </>
  );
}
