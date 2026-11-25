import { bidderService, registrationService } from '@domik/core';
import { formatDateTime } from '@domik/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DepositBadge, IdentityBadge, RegistrationBadge } from '@/components/status-badges';
import { PageHeader, Section } from '@/components/trustee/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { serviceContext } from '@/server/services';
import { bidderActor } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Dražitelj' };

export default async function BidderDashboard() {
  const actor = await bidderActor();
  const ctx = serviceContext();
  const [onboarding, registrations] = await Promise.all([
    bidderService.getOnboarding(ctx, actor),
    registrationService.listMyRegistrations(ctx, actor),
  ]);
  const { profile, missing } = onboarding;

  return (
    <>
      <PageHeader title="Moje prijave" subtitle="Vaše prijave na dražbe in stanje vašega računa." />

      {missing.length > 0 ? (
        <Alert variant="warning" className="grid gap-2">
          <p className="font-medium">Pred prijavo na dražbo dokončajte svoj profil:</p>
          <ul className="list-disc pl-5">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Button asChild size="sm" className="w-fit">
            <Link href="/drazitelj/profil">Uredi podatke</Link>
          </Button>
        </Alert>
      ) : (
        profile && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm">
            <span className="text-muted-foreground">Identiteta:</span>
            <IdentityBadge status={profile.status} />
            {profile.status === 'PENDING' && (
              <span className="text-muted-foreground">
                Preveri jo upravitelj ob obravnavi vaše prve prijave na dražbo.
              </span>
            )}
            {profile.status === 'REJECTED' && (
              <span>
                {profile.rejectionReason} –{' '}
                <Link href="/drazitelj/profil" className="underline underline-offset-2">
                  popravite podatke
                </Link>
              </span>
            )}
          </div>
        )
      )}

      <Section
        title="Prijave na dražbe"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/drazbe">Poišči dražbo</Link>
          </Button>
        }
      >
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Niste še prijavljeni na nobeno dražbo. Izberite dražbo in na njeni strani kliknite
            »Prijava na dražbo«.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {registrations.map(({ registration: r, auction, lotTitle }) => (
              <li key={r.id}>
                <Link
                  href={`/drazitelj/drazbe/${auction.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">{lotTitle}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.pseudonym} · začetek {formatDateTime(auction.startsAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    Varščina <DepositBadge status={r.depositStatus} />
                    Prijava <RegistrationBadge status={r.status} />
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
