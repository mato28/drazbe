import { caseService } from '@domik/core';
import { formatCents } from '@domik/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CaseForm } from '@/components/trustee/case-form';
import { PageHeader, Section } from '@/components/trustee/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toCaseDto } from '@/server/dto';
import { serviceContext } from '@/server/services';
import { load, pageId, trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Stečajni postopek' };

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const actor = await trusteeActor();
  const caseId = await pageId(params, 'caseId');
  const {
    case: c,
    lots,
    locked,
  } = await load(() => caseService.getCase(serviceContext(), actor, caseId));

  return (
    <>
      <PageHeader
        title={c.debtorName}
        subtitle={`${c.caseNumber} · ${c.court}`}
        back={{ href: '/upravitelj', label: 'Stečajni postopki' }}
      />
      {locked && (
        <Alert variant="warning" className="mb-4">
          Podatkov postopka ni mogoče spreminjati, ker je v njem objavljena dražba.
        </Alert>
      )}
      <CaseForm initial={toCaseDto(c)} disabled={locked} />

      <Section
        title="Predmeti prodaje"
        actions={
          <Button asChild size="sm">
            <Link href={`/upravitelj/postopki/${c.id}/predmeti/nov`}>Nov predmet prodaje</Link>
          </Button>
        }
      >
        {lots.length === 0 ? (
          <p className="text-sm text-muted-foreground">V tem postopku še ni predmetov prodaje.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {lots.map((lot) => (
              <li key={lot.id}>
                <Link
                  href={`/upravitelj/predmeti/${lot.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">{lot.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {[lot.address, lot.idZnak && `ID znak ${lot.idZnak}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {lot.isAgricultural && <Badge variant="warning">Kmetijsko zemljišče</Badge>}
                    {lot.appraisalValueCents !== null && (
                      <span>{formatCents(lot.appraisalValueCents)}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
