import { bidderService } from '@domik/core';
import { BIDDER_DOCUMENT_KINDS, DOCUMENT_KIND_LABEL } from '@domik/shared';
import type { Metadata } from 'next';
import { ProfileForm } from '@/components/bidder/profile-form';
import { DocumentManager } from '@/components/documents/document-manager';
import { IdentityBadge } from '@/components/status-badges';
import { PageHeader, Section } from '@/components/trustee/page-header';
import { Alert } from '@/components/ui/alert';
import { toBidderProfileDto, toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';
import { requireArea } from '@/server/session';

export const metadata: Metadata = { title: 'Moji podatki' };

export default async function BidderProfilePage() {
  const user = await requireArea('bidder', '/drazitelj/profil');
  const o = await bidderService.getOnboarding(serviceContext(), {
    userId: user.id,
    role: user.role,
  });
  const locked = o.profile?.status === 'VERIFIED';

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Moji podatki {o.profile && <IdentityBadge status={o.profile.status} />}
          </span>
        }
        subtitle="Podatki dražitelja, ki jih upravitelj preveri pred potrditvijo prijave na dražbo."
      />
      {locked && (
        <Alert variant="success" className="mb-4">
          Vaša identiteta je potrjena. Podatkov ni več mogoče spreminjati; za spremembo se obrnite
          na skrbnika platforme.
        </Alert>
      )}
      {o.profile?.status === 'REJECTED' && (
        <Alert variant="destructive" className="mb-4">
          <span className="font-medium">Identiteta je bila zavrnjena.</span>{' '}
          {o.profile.rejectionReason} Popravite podatke ali dokumente in jih znova shranite.
        </Alert>
      )}

      <ProfileForm
        initial={o.profile ? toBidderProfileDto(o.profile, o.phone) : null}
        defaultName={user.name}
        defaultPhone={o.phone ?? ''}
        locked={locked}
      />

      <Section title="Dokumenti">
        {o.profile ? (
          <>
            {o.missing.length > 0 && (
              <Alert variant="warning">
                <ul className="list-disc pl-5">
                  {o.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <DocumentManager
              uploadUrl="/api/bidder/documents"
              kinds={BIDDER_DOCUMENT_KINDS.map((k) => ({
                value: k,
                label: DOCUMENT_KIND_LABEL[k] ?? k,
              }))}
              documents={o.documents.map(toDocumentDto)}
              locked={locked}
              note="Dokumente vidite samo vi in stečajni upravitelji dražb, na katere se prijavite. Naložite obe strani osebnega dokumenta."
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Najprej shranite podatke dražitelja, nato boste lahko naložili osebni dokument.
          </p>
        )}
      </Section>
    </>
  );
}
