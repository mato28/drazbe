import { publicService } from '@domik/core';
import { publicAuctionQuerySchema } from '@domik/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuctionCard } from '@/components/public/auction-card';
import { AuctionFilters } from '@/components/public/auction-filters';
import { Button } from '@/components/ui/button';
import { serviceContext } from '@/server/services';

export const metadata: Metadata = {
  title: 'Aktualne dražbe',
  description:
    'Seznam objavljenih in potekajočih javnih dražb nepremičnin iz stečajnih postopkov. Filtrirajte po vrsti nepremičnine, kraju, ceni in stanju dražbe.',
  alternates: { canonical: '/drazbe' },
};

type RawParams = Record<string, string | string[] | undefined>;

/** Link to another page of the same filtered list. */
function pageHref(raw: RawParams, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value !== '' && key !== 'stran') params.set(key, value);
  }
  if (page > 1) params.set('stran', String(page));
  const qs = params.toString();
  return qs ? `/drazbe?${qs}` : '/drazbe';
}

function countLabel(n: number): string {
  if (n === 1) return '1 dražba';
  if (n === 2) return '2 dražbi';
  if (n === 3 || n === 4) return `${n} dražbe`;
  return `${n} dražb`;
}

export default async function AuctionListPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const query = publicAuctionQuerySchema.parse(raw);
  const list = await publicService.listPublicAuctions(serviceContext(), query);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Aktualne dražbe</h1>
      <p className="mt-1 text-muted-foreground">
        Objavljene in potekajoče javne dražbe nepremičnin iz stečajnih postopkov.
      </p>

      <div className="mt-6">
        <AuctionFilters query={query} municipalities={list.municipalities} />
      </div>

      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
        {list.total === 0 ? 'Ni zadetkov.' : `Najdeno: ${countLabel(list.total)}`}
      </p>

      {list.total === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">Trenutno ni dražb, ki bi ustrezale izbranim filtrom.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Poskusite z manj omejitvami ali si oglejte vse dražbe.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/drazbe">Vse dražbe</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((a) => (
            <li key={a.id}>
              <AuctionCard auction={a} />
            </li>
          ))}
        </ul>
      )}

      {list.pageCount > 1 && (
        <nav aria-label="Strani" className="mt-8 flex items-center justify-center gap-3 text-sm">
          {list.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(raw, list.page - 1)} rel="prev">
                Prejšnja
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Prejšnja
            </Button>
          )}
          <span className="text-muted-foreground">
            Stran {list.page} od {list.pageCount}
          </span>
          {list.page < list.pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(raw, list.page + 1)} rel="next">
                Naslednja
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Naslednja
            </Button>
          )}
        </nav>
      )}
    </main>
  );
}
