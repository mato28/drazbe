import type { Metadata } from 'next';
import { CaseForm } from '@/components/trustee/case-form';
import { PageHeader } from '@/components/trustee/page-header';
import { trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Nov postopek' };

export default async function NewCasePage() {
  await trusteeActor();
  return (
    <>
      <PageHeader
        title="Nov stečajni postopek"
        back={{ href: '/upravitelj', label: 'Stečajni postopki' }}
      />
      <CaseForm />
    </>
  );
}
