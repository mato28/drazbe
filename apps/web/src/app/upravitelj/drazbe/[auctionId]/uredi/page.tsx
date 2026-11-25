import { auctionService } from '@domik/core';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuctionForm } from '@/components/trustee/auction-form';
import { PageHeader } from '@/components/trustee/page-header';
import { auctionFormValues } from '@/server/auction-form-values';
import { serviceContext } from '@/server/services';
import { load, pageId, trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Urejanje dražbe' };

export default async function EditAuctionPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const actor = await trusteeActor();
  const auctionId = await pageId(params, 'auctionId');
  const { auction, lot } = await load(() =>
    auctionService.getAuction(serviceContext(), actor, auctionId),
  );
  if (auction.status !== 'DRAFT') redirect(`/upravitelj/drazbe/${auction.id}`);

  return (
    <>
      <PageHeader
        title="Urejanje osnutka dražbe"
        subtitle={lot.title}
        back={{ href: `/upravitelj/drazbe/${auction.id}`, label: 'Dražba' }}
      />
      <AuctionForm lotId={lot.id} auctionId={auction.id} initial={auctionFormValues(auction)} />
    </>
  );
}
