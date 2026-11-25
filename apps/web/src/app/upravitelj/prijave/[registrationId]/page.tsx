import { registrationService } from '@domik/core';
import { BIDDER_TYPE_LABEL, DOCUMENT_KIND_LABEL, formatCents, formatDateTime } from '@domik/shared';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DepositBadge, IdentityBadge, RegistrationBadge } from '@/components/status-badges';
import { PageHeader, Section } from '@/components/trustee/page-header';
import { RegistrationReviewActions } from '@/components/trustee/registration-review-actions';
import { Alert } from '@/components/ui/alert';
import { serviceContext } from '@/server/services';
import { load, pageId, trusteeActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Pregled prijave' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid gap-0.5 px-4 py-2.5 text-sm sm:grid-cols-[13rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DocLink({
  id,
  kind,
  filename,
  at,
}: {
  id: string;
  kind: string;
  filename: string;
  at: Date;
}) {
  return (
    <li>
      <a
        href={`/api/documents/${id}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 px-4 py-3 hover:bg-accent"
      >
        <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{DOCUMENT_KIND_LABEL[kind] ?? kind}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {filename} · naloženo {formatDateTime(at)}
          </span>
        </span>
        <span className="text-sm underline underline-offset-2">Odpri</span>
      </a>
    </li>
  );
}

export default async function RegistrationReviewPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  const actor = await trusteeActor();
  const id = await pageId(params, 'registrationId');
  const d = await load(() =>
    registrationService.getRegistrationReview(serviceContext(), actor, id),
  );
  const { registration: r, bidder: b, auction, lot, user } = d;
  const editable = auction.status === 'PUBLISHED' || auction.status === 'REGISTRATION_CLOSED';

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.pseudonym} <RegistrationBadge status={r.status} />
          </span>
        }
        subtitle={`Prijava na dražbo št. ${auction.number} · ${lot.title}`}
        back={{ href: `/upravitelj/drazbe/${auction.id}`, label: 'Dražba' }}
      />
      {r.status === 'REJECTED' && (
        <Alert variant="destructive" className="mb-4">
          <span className="font-medium">Prijava je zavrnjena.</span> {r.rejectionReason}
        </Alert>
      )}

      <RegistrationReviewActions
        registrationId={r.id}
        identityStatus={b.status}
        identityNeedsReview={d.identityNeedsReview}
        depositStatus={r.depositStatus}
        depositNote={r.depositNote}
        registrationStatus={r.status}
        blockers={d.blockers}
        preemptionEnabled={auction.preemptionEnabled}
        isPreemptionHolder={r.isPreemptionHolder}
        preemptionRank={r.preemptionRank}
        editable={editable}
      />

      <Section title="Dražitelj">
        <dl className="divide-y rounded-lg border">
          <Row label="Identiteta">
            <span className="flex flex-wrap items-center gap-2">
              <IdentityBadge status={b.status} />
              {b.status === 'VERIFIED' && b.verifiedAt && (
                <span className="text-muted-foreground">
                  potrjena {formatDateTime(b.verifiedAt)}
                </span>
              )}
              {b.status === 'REJECTED' && <span>{b.rejectionReason}</span>}
            </span>
          </Row>
          <Row label="Vrsta">{BIDDER_TYPE_LABEL[b.type]}</Row>
          {b.type === 'COMPANY' && (
            <>
              <Row label="Pravna oseba">{b.companyName}</Row>
              <Row label="Matična številka">{b.companyRegNo}</Row>
              <Row label="Zakoniti zastopnik">{b.representativeName}</Row>
            </>
          )}
          <Row label={b.type === 'COMPANY' ? 'Oseba, ki draži' : 'Ime in priimek'}>
            {b.fullName}
            {b.type === 'COMPANY' &&
              (b.actsAsLegalRepresentative ? ' (zakoniti zastopnik)' : ' (po pooblastilu)')}
          </Row>
          <Row label="Davčna številka">{b.taxId}</Row>
          <Row label={b.type === 'COMPANY' ? 'Sedež' : 'Naslov'}>{b.address}</Row>
          <Row label="E-pošta">{user.email}</Row>
          <Row label="Telefon">{user.phone}</Row>
        </dl>
      </Section>

      <Section title="Dokumenti dražitelja">
        {d.bidderDocuments.length === 0 && !d.statement ? (
          <p className="text-sm text-muted-foreground">Dražitelj še ni naložil dokumentov.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {d.bidderDocuments.map((doc) => (
              <DocLink
                key={doc.id}
                id={doc.id}
                kind={doc.kind}
                filename={doc.filename}
                at={doc.createdAt}
              />
            ))}
            {d.statement && (
              <DocLink
                id={d.statement.id}
                kind={d.statement.kind}
                filename={d.statement.filename}
                at={d.statement.createdAt}
              />
            )}
          </ul>
        )}
        {!d.statement && (
          <p className="text-sm text-muted-foreground">Podpisana izjava še ni naložena.</p>
        )}
      </Section>

      <Section title="Varščina">
        <dl className="divide-y rounded-lg border">
          <Row label="Stanje">
            <DepositBadge status={r.depositStatus} />
          </Row>
          <Row label="Znesek">{formatCents(auction.depositCents)}</Row>
          <Row label="Sklic">
            <span className="font-mono">{r.paymentReference}</span>
          </Row>
          <Row label="Potrjeno">{r.depositPaidAt && formatDateTime(r.depositPaidAt)}</Row>
          <Row label="Opomba">{r.depositNote}</Row>
          <Row label="Prijava oddana">{formatDateTime(r.createdAt)}</Row>
          <Row label="Rok za prijavo">{formatDateTime(auction.registrationDeadline)}</Row>
        </dl>
      </Section>
    </>
  );
}
