import { type PublicAuctionSummary } from '@domik/core';
import {
  AUCTION_TYPE_LABEL,
  formatCents,
  formatDateTime,
  PROPERTY_KIND_LABEL,
} from '@domik/shared';
import { Building2, CalendarClock, MapPin } from 'lucide-react';
import Link from 'next/link';
import { formatArea, publicDocumentUrl } from '@/lib/site';
import { PhaseBadge } from './phase-badge';

export function AuctionCard({ auction: a }: { auction: PublicAuctionSummary }) {
  const area = formatArea(a.areaM2);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] bg-muted">
        {a.coverPhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served via a signed-URL redirect
          <img
            src={publicDocumentUrl(a.coverPhotoId)}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/50">
            <Building2 className="size-12" aria-hidden />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <PhaseBadge phase={a.phase} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {PROPERTY_KIND_LABEL[a.propertyKind]}
            {area && ` · ${area}`}
          </p>
          <h3 className="mt-0.5 leading-snug font-semibold">
            <Link href={`/drazbe/${a.id}`} className="after:absolute after:inset-0">
              {a.title}
            </Link>
          </h3>
        </div>
        <dl className="grid gap-1 text-sm text-muted-foreground">
          {a.municipality && (
            <div className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <dt className="sr-only">Kraj</dt>
              <dd>{a.municipality}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <dt className="sr-only">Začetek dražbe</dt>
            <dd>{formatDateTime(a.startsAt)}</dd>
          </div>
        </dl>
        <div className="mt-auto border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Izklicna cena · {AUCTION_TYPE_LABEL[a.type]}
          </p>
          <p className="text-lg font-semibold">{formatCents(a.startingPriceCents)}</p>
        </div>
      </div>
    </article>
  );
}
