import { caseService } from '@domik/core';
import type { Metadata } from 'next';
import { LotForm } from '@/components/trustee/lot-form';
import { PageHeader } from '@/components/trustee/page-header';
import { serviceContext } from '@/server/services';
import { load, pageId, trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Nov predmet prodaje' };

export default async function NewLotPage({ params }: { params: Promise<{ caseId: string }> }) {
  const actor = await trusteeActor();
  const caseId = await pageId(params, 'caseId');
  const { case: c } = await load(() => caseService.getCase(serviceContext(), actor, caseId));

  return (
    <>
      <PageHeader
        title="Nov predmet prodaje"
        subtitle={`${c.debtorName} · ${c.caseNumber}`}
        back={{ href: `/upravitelj/postopki/${c.id}`, label: 'Postopek' }}
      />
      <LotForm caseId={c.id} />
    </>
  );
}
