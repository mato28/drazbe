import { auctionService, lotService, OPEN_STATUSES } from '@domik/core';
import {
  AUCTION_TYPE_LABEL,
  formatCents,
  formatDateTime,
  LOT_DOCUMENT_KIND_LABEL,
  LOT_DOCUMENT_KINDS,
} from '@domik/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DocumentManager } from '@/components/documents/document-manager';
import { LotForm } from '@/components/trustee/lot-form';
import { PageHeader, Section } from '@/components/trustee/page-header';
import { AuctionStatusBadge } from '@/components/trustee/status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toDocumentDto, toLotDto } from '@/server/dto';
import { serviceContext } from '@/server/services';
import { load, pageId, trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Predmet prodaje' };

export default async function LotPage({ params }: { params: Promise<{ lotId: string }> }) {
  const actor = await trusteeActor();
  const lotId = await pageId(params, 'lotId');
  const {
    lot,
    case: c,
    documents,
    auctions,
    locked,
  } = await load(() => lotService.getLot(serviceContext(), actor, lotId));
  const sold = auctions.some((a) => a.status === 'ENDED');
  const hasOpenAuction = auctions.some((a) => OPEN_STATUSES.includes(a.status));

  return (
    <>
      <PageHeader
        title={lot.title}
        subtitle={`${c.debtorName} · ${c.caseNumber}`}
        back={{ href: `/upravitelj/postopki/${c.id}`, label: 'Postopek' }}
      />
      {locked && (
        <Alert variant="warning" className="mb-4">
          Predmeta prodaje in dokumentov ni mogoče spreminjati, ker je zanj objavljena dražba.
        </Alert>
      )}
      {lot.isAgricultural && (
        <Alert variant="warning" className="mb-4">
          {auctionService.AGRICULTURAL_NOT_SUPPORTED}
        </Alert>
      )}
      <LotForm caseId={c.id} initial={toLotDto(lot)} disabled={locked} />

      <Section title="Dokumenti">
        <DocumentManager
          uploadUrl={`/api/lots/${lot.id}/documents`}
          kinds={LOT_DOCUMENT_KINDS.map((k) => ({ value: k, label: LOT_DOCUMENT_KIND_LABEL[k] }))}
          documents={documents.map(toDocumentDto)}
          locked={locked}
          note="Dokumenti in fotografije bodo z objavo dražbe javno dostopni. Ne nalagajte dokumentov z osebnimi podatki, ki niso namenjeni objavi."
        />
      </Section>

      <Section
        title="Dražbe"
        actions={
          !sold &&
          !hasOpenAuction && (
            <Button asChild size="sm">
              <Link href={`/upravitelj/predmeti/${lot.id}/drazbe/nova`}>Nova dražba</Link>
            </Button>
          )
        }
      >
        {auctions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Za ta predmet še ni dražbe.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {auctions.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/upravitelj/drazbe/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">{AUCTION_TYPE_LABEL[a.type]}</div>
                    <div className="text-sm text-muted-foreground">
                      Začetek {formatDateTime(a.startsAt)} · izklicna cena{' '}
                      {formatCents(a.startingPriceCents)}
                    </div>
                  </div>
                  <AuctionStatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
