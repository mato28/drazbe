import type { Metadata } from 'next';
import { BankImport } from '@/components/trustee/bank-import';
import { PageHeader } from '@/components/trustee/page-header';
import { trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Uvoz bančnega izpiska' };

export default async function BankImportPage() {
  await trusteeActor();
  return (
    <>
      <PageHeader
        title="Uvoz bančnega izpiska"
        subtitle="Naložite izpisek računa stečajnega dolžnika. Sistem po sklicu, znesku in plačniku predlaga, katere varščine so plačane; potrdite jih vi."
        back={{ href: '/upravitelj', label: 'Postopki in dražbe' }}
      />
      <BankImport />
    </>
  );
}
