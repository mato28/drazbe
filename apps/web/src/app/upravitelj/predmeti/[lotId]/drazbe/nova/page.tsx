import { auctionService, lotService } from '@domik/core';
import type { Metadata } from 'next';
import { AuctionForm } from '@/components/trustee/auction-form';
import { PageHeader } from '@/components/trustee/page-header';
import { Alert } from '@/components/ui/alert';
import { newAuctionFormValues } from '@/server/auction-form-values';
import { serviceContext } from '@/server/services';
import { load, pageId, trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Nova dražba' };

export default async function NewAuctionPage({ params }: { params: Promise<{ lotId: string }> }) {
  const actor = await trusteeActor();
  const lotId = await pageId(params, 'lotId');
  const ctx = serviceContext();
  const { lot } = await load(() => lotService.getLot(ctx, actor, lotId));

  return (
    <>
      <PageHeader
        title="Nova dražba"
        subtitle={lot.title}
        back={{ href: `/upravitelj/predmeti/${lot.id}`, label: 'Predmet prodaje' }}
      />
      {lot.isAgricultural && (
        <Alert variant="warning" className="mb-6">
          {auctionService.AGRICULTURAL_NOT_SUPPORTED}
        </Alert>
      )}
      <AuctionForm lotId={lot.id} initial={newAuctionFormValues(lot, ctx.clock.now())} />
    </>
  );
}
