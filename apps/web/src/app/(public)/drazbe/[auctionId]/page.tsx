import { DomainError, type PublicAuctionDetail, publicService } from '@domik/core';
import {
  AUCTION_TYPE_LABEL,
  formatCents,
  formatDateTime,
  LOT_DOCUMENT_KIND_LABEL,
  type LotDocumentKind,
  PROPERTY_KIND_LABEL,
} from '@domik/shared';
import { Building2, ChevronLeft, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';
import { z } from 'zod';
import { Countdown } from '@/components/public/countdown';
import { PhaseBadge } from '@/components/public/phase-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatArea, publicDocumentUrl, SITE_NAME } from '@/lib/site';
import { serverConfig } from '@/server/config';
import { serviceContext } from '@/server/services';

interface Props {
  params: Promise<{ auctionId: string }>;
}

/** One lookup per request, shared by generateMetadata and the page. Null = not public. */
const loadAuction = cache(async (id: string): Promise<PublicAuctionDetail | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  try {
    return await publicService.getPublicAuction(serviceContext(), id);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') return null;
    throw e;
  }
});

function summaryLine(a: PublicAuctionDetail): string {
  return [
    PROPERTY_KIND_LABEL[a.propertyKind],
    a.municipality,
    formatArea(a.areaM2),
    `izklicna cena ${formatCents(a.startingPriceCents)}`,
    `dražba ${formatDateTime(a.startsAt)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await loadAuction((await params).auctionId);
  if (!a) return { title: 'Dražba ne obstaja', robots: { index: false } };
  const description = `${summaryLine(a)}. ${a.lot.description ?? ''}`.trim().slice(0, 300);
  return {
    title: `${a.title} — javna dražba`,
    description,
    alternates: { canonical: `/drazbe/${a.id}` },
    openGraph: {
      type: 'article',
      title: a.title,
      description,
      url: `/drazbe/${a.id}`,
      ...(a.coverPhotoId ? { images: [{ url: publicDocumentUrl(a.coverPhotoId) }] } : {}),
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid gap-0.5 px-4 py-2.5 text-sm sm:grid-cols-[14rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 mb-3 text-xl font-semibold tracking-tight">{children}</h2>;
}

/** Which moment the visitor is waiting for in each phase. */
function countdownFor(a: PublicAuctionDetail): { target: Date; label: string } | null {
  switch (a.phase) {
    case 'REGISTRATION_OPEN':
      return { target: a.registrationDeadline, label: 'Do izteka roka za prijavo' };
    case 'REGISTRATION_CLOSED':
      return { target: a.startsAt, label: 'Do začetka dražbe' };
    case 'LIVE':
      return a.endsAt ? { target: a.endsAt, label: 'Do predvidenega konca dražbe' } : null;
    default:
      return null;
  }
}

function jsonLd(a: PublicAuctionDetail): string {
  // Structured data needs absolute URLs.
  const abs = (path: string): string => new URL(path, serverConfig().APP_URL).toString();
  const data = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: a.title,
    description: a.lot.description ?? summaryLine(a),
    url: abs(`/drazbe/${a.id}`),
    ...(a.publishedAt ? { datePosted: a.publishedAt.toISOString() } : {}),
    ...(a.coverPhotoId ? { image: abs(publicDocumentUrl(a.coverPhotoId)) } : {}),
    offers: {
      '@type': 'Offer',
      price: (Number(a.startingPriceCents) / 100).toFixed(2),
      priceCurrency: 'EUR',
      availabilityStarts: a.startsAt.toISOString(),
    },
  };
  // Escape "<" so the JSON can never close the <script> element.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function AuctionDetailPage({ params }: Props) {
  const a = await loadAuction((await params).auctionId);
  if (!a) notFound();

  const serverNow = serviceContext().clock.now();
  const countdown = countdownFor(a);
  const [cover, ...morePhotos] = a.photos;
  const area = formatArea(a.areaM2);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(a) }} />

      <Link
        href="/drazbe"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Vse dražbe
      </Link>

      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <PhaseBadge phase={a.phase} />
          <span className="text-sm text-muted-foreground">{AUCTION_TYPE_LABEL[a.type]}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {a.title}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {[PROPERTY_KIND_LABEL[a.propertyKind], a.municipality, area].filter(Boolean).join(' · ')}
        </p>
      </header>

      {a.phase === 'CANCELLED' && (
        <Alert variant="destructive" className="mt-4">
          <span className="font-medium">Dražba je preklicana.</span>
          {a.closedReason && ` Razlog: ${a.closedReason}`}
        </Alert>
      )}
      {a.phase === 'ENDED' && <Alert className="mt-4">Dražba je zaključena.</Alert>}
      {a.phase === 'UNSUCCESSFUL' && (
        <Alert className="mt-4">Dražba je bila neuspešna – predmet ni bil prodan.</Alert>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* Sidebar first in the DOM on mobile so price, dates and the CTA come right after the title. */}
        <aside className="lg:order-2">
          <div className="grid gap-5 rounded-xl border bg-card p-5 lg:sticky lg:top-20">
            <div>
              <p className="text-sm text-muted-foreground">Izklicna cena</p>
              <p className="text-3xl font-semibold tracking-tight">
                {formatCents(a.startingPriceCents)}
              </p>
              {a.type === 'DESCENDING' && a.floorPriceCents !== null && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Najnižja cena {formatCents(a.floorPriceCents)}
                </p>
              )}
            </div>

            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Varščina</dt>
                <dd className="font-medium">{formatCents(a.depositCents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Rok za prijavo</dt>
                <dd className="text-right font-medium">{formatDateTime(a.registrationDeadline)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Začetek dražbe</dt>
                <dd className="text-right font-medium">{formatDateTime(a.startsAt)}</dd>
              </div>
              {a.endsAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {a.type === 'ASCENDING' ? 'Konec dražbe' : 'Najpozneje do'}
                  </dt>
                  <dd className="text-right font-medium">{formatDateTime(a.endsAt)}</dd>
                </div>
              )}
            </dl>

            {countdown && (
              <Countdown
                target={countdown.target.toISOString()}
                serverNow={serverNow.toISOString()}
                label={countdown.label}
              />
            )}

            {a.phase === 'REGISTRATION_OPEN' && (
              <div className="grid gap-2">
                <Button asChild size="lg">
                  <Link href={`/drazitelj/drazbe/${a.id}`}>Prijava na dražbo</Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Za sodelovanje potrebujete račun dražitelja, potrjeno identiteto in plačano
                  varščino.{' '}
                  <Link href="/registracija" className="underline underline-offset-2">
                    Ustvarite račun
                  </Link>{' '}
                  ali preberite,{' '}
                  <Link href="/kako-deluje" className="underline underline-offset-2">
                    kako deluje
                  </Link>
                  .
                </p>
              </div>
            )}
            {a.phase === 'REGISTRATION_CLOSED' && (
              <p className="text-sm text-muted-foreground">
                Rok za prijavo je potekel. Dražijo lahko le potrjeni dražitelji.
              </p>
            )}
            {(a.phase === 'REGISTRATION_CLOSED' || a.phase === 'LIVE' || a.phase === 'ENDED') && (
              <Button asChild size="lg" variant={a.phase === 'LIVE' ? 'default' : 'outline'}>
                <Link href={`/drazbe/${a.id}/v-zivo`}>
                  {a.phase === 'LIVE'
                    ? 'Spremljaj dražbo v živo'
                    : a.phase === 'ENDED'
                      ? 'Potek dražbe'
                      : 'Soba za dražbo'}
                </Link>
              </Button>
            )}
          </div>
        </aside>

        <div className="min-w-0 lg:order-1">
          {/* Photos */}
          {cover ? (
            <div className="grid gap-2">
              <a href={publicDocumentUrl(cover.id)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed-URL redirect */}
                <img
                  src={publicDocumentUrl(cover.id)}
                  alt={`${a.title} – fotografija 1`}
                  className="aspect-[16/10] w-full rounded-xl bg-muted object-cover"
                />
              </a>
              {morePhotos.length > 0 && (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {morePhotos.map((p, i) => (
                    <li key={p.id}>
                      <a href={publicDocumentUrl(p.id)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed-URL redirect */}
                        <img
                          src={publicDocumentUrl(p.id)}
                          alt={`${a.title} – fotografija ${i + 2}`}
                          loading="lazy"
                          className="aspect-[4/3] w-full rounded-lg bg-muted object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-xl bg-muted text-muted-foreground">
              <Building2 className="size-12 opacity-50" aria-hidden />
              <span className="text-sm">Fotografije niso na voljo</span>
            </div>
          )}

          {a.lot.description && (
            <>
              <SectionTitle>Opis</SectionTitle>
              <p className="leading-relaxed whitespace-pre-line">{a.lot.description}</p>
            </>
          )}

          <SectionTitle>Podatki o nepremičnini</SectionTitle>
          <dl className="divide-y rounded-xl border">
            <Row label="Vrsta">{PROPERTY_KIND_LABEL[a.propertyKind]}</Row>
            <Row label="Naslov">{a.lot.address}</Row>
            <Row label="Površina">{area}</Row>
            <Row label="Katastrska občina">{a.lot.cadastralMunicipality}</Row>
            <Row label="Parcelna številka">{a.lot.parcelNumber}</Row>
            <Row label="Številka stavbe">{a.lot.buildingId}</Row>
            <Row label="Številka dela stavbe">{a.lot.partId}</Row>
            <Row label="ID znak">{a.lot.idZnak}</Row>
            <Row label="Namenska raba">{a.lot.landUse}</Row>
            <Row label="Ocenjena vrednost">
              {a.lot.appraisalValueCents !== null && formatCents(a.lot.appraisalValueCents)}
            </Row>
            <Row label="Bremena in omejitve">{a.lot.encumbrancesText}</Row>
          </dl>

          {a.report && (
            <>
              <SectionTitle>Zapisnik o dražbi</SectionTitle>
              <a
                href={publicDocumentUrl(a.report.id)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border px-4 py-3 hover:bg-accent"
              >
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Zapisnik o javni dražbi</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    Celoten potek dražbe s časi strežnika in zgoščenimi vrednostmi; dražitelji so
                    navedeni z oznakami · {formatSize(a.report.sizeBytes)}
                  </span>
                </span>
                <span className="text-sm underline underline-offset-2">Prenesi</span>
              </a>
            </>
          )}

          <SectionTitle>Dokumentacija</SectionTitle>
          {a.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Dokumenti niso priloženi.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {a.documents.map((d) => (
                <li key={d.id}>
                  <a
                    href={publicDocumentUrl(d.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
                  >
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {LOT_DOCUMENT_KIND_LABEL[d.kind as LotDocumentKind]}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {d.filename} · {formatSize(d.sizeBytes)}
                      </span>
                    </span>
                    <span className="text-sm underline underline-offset-2">Prenesi</span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <SectionTitle>Pravila dražbe</SectionTitle>
          <ul className="grid gap-2.5 rounded-xl border p-4 text-sm leading-relaxed">
            {a.rules.map((rule) => (
              <li key={rule} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/40"
                />
                <span>{rule}</span>
              </li>
            ))}
          </ul>

          <SectionTitle>Stečajni postopek in upravitelj</SectionTitle>
          <dl className="divide-y rounded-xl border">
            <Row label="Stečajni dolžnik">{a.case.debtorName}</Row>
            <Row label="Sodišče">{a.case.court}</Row>
            <Row label="Opravilna številka">{a.case.caseNumber}</Row>
            <Row label="Stečajni upravitelj">
              {a.trustee.firmName ? `${a.trustee.name}, ${a.trustee.firmName}` : a.trustee.name}
            </Row>
            <Row label="Soglasje sodišča k prodaji">{a.courtApprovalRef}</Row>
            <Row label="Objavljeno">{a.publishedAt && formatDateTime(a.publishedAt)}</Row>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Podatki so informativni. Zavezujoče so listine stečajnega postopka in razpis dražbe.{' '}
            {SITE_NAME} ne sprejema plačil – varščina in kupnina se plačata na račun stečajnega
            dolžnika.
          </p>
        </div>
      </div>
    </main>
  );
}
