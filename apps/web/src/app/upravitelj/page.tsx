import { auctionService, caseService, formatIban } from '@domik/core';
import { AUCTION_TYPE_LABEL, formatCents, formatDateTime } from '@domik/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, Section } from '@/components/trustee/page-header';
import { AuctionStatusBadge } from '@/components/trustee/status-badge';
import { Button } from '@/components/ui/button';
import { serviceContext } from '@/server/services';
import { trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Upravitelj' };

export default async function TrusteeDashboard() {
  const actor = await trusteeActor();
  const ctx = serviceContext();
  const [cases, auctions] = await Promise.all([
    caseService.listCases(ctx, actor),
    auctionService.listAuctions(ctx, actor),
  ]);

  return (
    <>
      <PageHeader
        title="Stečajni postopki"
        subtitle="Vaši postopki, predmeti prodaje in dražbe."
        actions={
          <Button asChild>
            <Link href="/upravitelj/postopki/nov">Nov postopek</Link>
          </Button>
        }
      />

      {cases.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nimate še nobenega postopka. Začnite z gumbom »Nov postopek«.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/upravitelj/postopki/${c.id}`}
                className="block rounded-lg border p-4 transition-colors hover:bg-accent"
              >
                <div className="font-medium">{c.debtorName}</div>
                <div className="text-sm text-muted-foreground">
                  {c.caseNumber} · {c.court}
                </div>
                <div className="mt-2 font-mono text-xs text-muted-foreground">
                  {formatIban(c.estateIban)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Section title="Dražbe">
        {auctions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ni dražb. Dražbo ustvarite na strani predmeta prodaje.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Predmet</th>
                  <th className="px-3 py-2 font-medium">Postopek</th>
                  <th className="px-3 py-2 font-medium">Vrsta</th>
                  <th className="px-3 py-2 font-medium">Izklicna cena</th>
                  <th className="px-3 py-2 font-medium">Začetek</th>
                  <th className="px-3 py-2 font-medium">Stanje</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auctions.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/upravitelj/drazbe/${a.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {a.lotTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{a.caseNumber}</td>
                    <td className="px-3 py-2">{AUCTION_TYPE_LABEL[a.type]}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatCents(a.startingPriceCents)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(a.startsAt)}</td>
                    <td className="px-3 py-2">
                      <AuctionStatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
