import {
  bidderService,
  DomainError,
  formatIban,
  getBidderPostAuction,
  publicService,
  registrationService,
} from '@domik/core';
import { formatCents, formatDateTime, SALE_STATUS_LABEL } from '@domik/shared';
import { Check, Circle, Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { RegisterButton } from '@/components/bidder/register-button';
import { BuyerContractUpload } from '@/components/post-auction/buyer-contract-upload';
import { RefundIbanForm } from '@/components/post-auction/refund-iban-form';
import { SignatureCheckView } from '@/components/post-auction/signature-check';
import { Badge } from '@/components/ui/badge';
import { StatementUpload } from '@/components/bidder/statement-upload';
import { DepositBadge, IdentityBadge, RegistrationBadge } from '@/components/status-badges';
import { PageHeader } from '@/components/trustee/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { serviceContext } from '@/server/services';
import { bidderActor, pageId } from '@/server/trustee-page';

export const metadata: Metadata = { title: 'Prijava na dražbo' };

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <li className="grid gap-3 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium',
            done ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-muted-foreground',
          )}
        >
          {done ? <Check className="size-4" aria-label="Opravljeno" /> : n}
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="grid gap-3 text-sm sm:pl-10">{children}</div>
    </li>
  );
}

function PayRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

export default async function AuctionRegistrationPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const actor = await bidderActor();
  const auctionId = await pageId(params, 'auctionId');
  const ctx = serviceContext();

  const auction = await publicService.getPublicAuction(ctx, auctionId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const [mine, onboarding] = await Promise.all([
    registrationService.getMyRegistrationForAuction(ctx, actor, auctionId),
    bidderService.getOnboarding(ctx, actor),
  ]);

  const header = (
    <PageHeader
      title={auction.title}
      subtitle={`Prijava na dražbo · začetek ${formatDateTime(auction.startsAt)}`}
      back={{ href: `/drazbe/${auction.id}`, label: 'Stran dražbe' }}
    />
  );

  // --- not registered yet ----------------------------------------------------
  if (!mine) {
    const open = auction.phase === 'REGISTRATION_OPEN';
    return (
      <>
        {header}
        {!open ? (
          <Alert variant="warning">
            Prijava na to dražbo ni več mogoča (rok za prijavo:{' '}
            {formatDateTime(auction.registrationDeadline)}).
          </Alert>
        ) : onboarding.missing.length > 0 ? (
          <Alert variant="warning" className="grid gap-2">
            <p className="font-medium">Pred prijavo na dražbo dokončajte svoj profil:</p>
            <ul className="list-disc pl-5">
              {onboarding.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <Button asChild size="sm" className="w-fit">
              <Link href="/drazitelj/profil">Uredi podatke</Link>
            </Button>
          </Alert>
        ) : (
          <div className="grid gap-4">
            <dl className="grid gap-2 rounded-xl border p-4 text-sm sm:max-w-md">
              <PayRow label="Izklicna cena">{formatCents(auction.startingPriceCents)}</PayRow>
              <PayRow label="Varščina">{formatCents(auction.depositCents)}</PayRow>
              <PayRow label="Rok za prijavo">{formatDateTime(auction.registrationDeadline)}</PayRow>
            </dl>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Z oddajo prijave dobite oznako dražitelja in sklic za plačilo varščine. Prijava bo
              popolna, ko do roka naložite podpisano izjavo in plačate varščino; nato jo potrdi
              upravitelj.
            </p>
            <RegisterButton auctionId={auction.id} />
          </div>
        )}
      </>
    );
  }

  // --- registered ------------------------------------------------------------
  const { registration: r, payment, statement, canUploadStatement, identityStatus } = mine;
  // After the auction the deposit becomes APPLIED / REFUND_PENDING / … — it was still paid.
  const paid = r.depositStatus !== 'PENDING';
  const post =
    auction.closedAt !== null && r.status === 'APPROVED'
      ? await getBidderPostAuction(ctx, actor, auctionId)
      : null;
  const sale = post?.sale ?? null;
  const now = new Date();

  return (
    <>
      {header}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
        <span>
          Vaša oznaka: <span className="font-semibold">{r.pseudonym}</span>
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          Prijava <RegistrationBadge status={r.status} />
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          Identiteta <IdentityBadge status={identityStatus} />
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          Varščina <DepositBadge status={r.depositStatus} />
        </span>
      </div>

      {post && (
        <section className="mb-6 grid gap-4 rounded-xl border p-4 sm:p-5">
          <h2 className="font-semibold">Po dražbi</h2>
          {post.isBuyer && sale ? (
            <>
              <Alert variant={sale.sale.status === 'DEFAULTED' ? 'destructive' : 'success'}>
                {sale.sale.status === 'DEFAULTED' ? (
                  <>
                    <span className="font-medium">Obveznosti iz nakupa niso bile izpolnjene.</span>{' '}
                    {sale.sale.defaultReason} Varščina je zapadla v korist stečajne mase.
                  </>
                ) : (
                  <>
                    <span className="font-medium">Vaša ponudba je bila najvišja.</span> Kupnina{' '}
                    {formatCents(sale.amounts.priceCents)}; vplačana varščina{' '}
                    {formatCents(sale.amounts.depositAppliedCents)} se všteje vanjo.
                  </>
                )}
              </Alert>
              <dl className="grid gap-2">
                <PayRow label="Stanje">
                  <Badge variant="secondary">{SALE_STATUS_LABEL[sale.sale.status]}</Badge>
                </PayRow>
                {sale.deadline && (
                  <PayRow label="Naslednji korak">
                    <span className={sale.deadline.at < now ? 'text-destructive' : ''}>
                      {sale.deadline.task} do {formatDateTime(sale.deadline.at)}
                    </span>
                  </PayRow>
                )}
              </dl>

              {sale.sale.status === 'AWAITING_CONTRACT' &&
                (sale.contract ? (
                  <div className="grid gap-3">
                    <p className="text-muted-foreground">
                      Prenesite pogodbo, jo podpišite s{' '}
                      <strong>kvalificiranim elektronskim podpisom</strong> (npr. podpis s SI-PASS
                      ali lastnim kvalificiranim potrdilom, npr. SIGEN-CA, POSTArCA, Halcom) in
                      podpisano datoteko PDF naložite tukaj. Vsebine pogodbe ne spreminjajte. Podpis
                      mora biti na ime <strong>{sale.buyerSignerName}</strong>.
                    </p>
                    <Button asChild variant="outline" className="w-fit">
                      <a
                        href={`/api/documents/${sale.contract.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download aria-hidden />
                        Prenesi pogodbo (PDF)
                      </a>
                    </Button>
                    {sale.buyerSigned ? (
                      <div className="grid gap-2">
                        <p>Podpisano pogodbo ste naložili. Čaka na podpis upravitelja.</p>
                        {sale.buyerSignatureCheck && (
                          <SignatureCheckView check={sale.buyerSignatureCheck} />
                        )}
                      </div>
                    ) : (
                      <BuyerContractUpload auctionId={auction.id} />
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Upravitelj pripravlja prodajno pogodbo. Ko bo pripravljena, vas obvestimo po
                    e-pošti.
                  </p>
                ))}

              {sale.signed && (
                <p>
                  Podpisana pogodba:{' '}
                  <a
                    href={`/api/documents/${sale.signed.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    {sale.signed.filename}
                  </a>
                </p>
              )}

              {(sale.sale.status === 'CONTRACT_SIGNED' ||
                sale.sale.status === 'DOWN_PAYMENT_PAID') && (
                <dl className="grid gap-2 rounded-lg border p-3">
                  <PayRow label="Za plačilo">
                    {formatCents(
                      sale.sale.status === 'CONTRACT_SIGNED' &&
                        sale.amounts.downPaymentDueCents > 0n
                        ? sale.amounts.downPaymentDueCents
                        : sale.sale.status === 'CONTRACT_SIGNED'
                          ? sale.amounts.totalDueCents
                          : sale.amounts.remainderCents,
                    )}
                  </PayRow>
                  <PayRow label="Prejemnik">{payment.payeeName}</PayRow>
                  <PayRow label="IBAN">
                    <span className="font-mono">{formatIban(payment.payeeIban)}</span>
                  </PayRow>
                  <PayRow label="Sklic">
                    <span className="font-mono">{payment.reference}</span>
                  </PayRow>
                </dl>
              )}
            </>
          ) : (
            <div className="grid gap-3">
              <p>
                {r.depositStatus === 'REFUNDED'
                  ? `Varščina ${formatCents(payment.amountCents)} vam je bila vrnjena${r.refundedAt ? ` (${formatDateTime(r.refundedAt)})` : ''}.`
                  : r.depositStatus === 'REFUND_PENDING'
                    ? `Dražba je zaključena. Upravitelj vam bo vrnil varščino ${formatCents(payment.amountCents)}.`
                    : 'Dražba je zaključena.'}
              </p>
              {r.depositStatus === 'REFUND_PENDING' &&
                (post.registration.refundOrderDocId ? (
                  <p className="text-muted-foreground">
                    Vračilo je v obdelavi na račun{' '}
                    <span className="font-mono">{post.registration.refundIban}</span>.
                  </p>
                ) : (
                  <RefundIbanForm registrationId={r.id} current={post.registration.refundIban} />
                ))}
            </div>
          )}
          {post.publicReport && (
            <p className="text-muted-foreground">
              <a
                href={`/api/documents/${post.publicReport.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Zapisnik o dražbi (PDF)
              </a>{' '}
              – javna različica, dražitelji so navedeni z oznakami.
            </p>
          )}
        </section>
      )}

      {r.status === 'APPROVED' && !post && (
        <Alert variant="success" className="mb-6">
          <span className="font-medium">Prijava je potrjena.</span> Na dražbi, ki se začne{' '}
          {formatDateTime(auction.startsAt)}, boste dražili pod oznako {r.pseudonym}.{' '}
          <Link
            href={`/drazbe/${auction.id}/v-zivo`}
            className="font-medium underline underline-offset-2"
          >
            Odpri dražbo v živo
          </Link>
        </Alert>
      )}
      {r.status === 'REJECTED' && (
        <Alert variant="destructive" className="mb-6">
          <span className="font-medium">Prijava je zavrnjena.</span> {r.rejectionReason}
        </Alert>
      )}
      {identityStatus === 'REJECTED' && r.status !== 'REJECTED' && (
        <Alert variant="destructive" className="mb-6">
          Upravitelj je zavrnil preverjanje identitete: {onboarding.profile?.rejectionReason}{' '}
          <Link href="/drazitelj/profil" className="underline underline-offset-2">
            Popravite podatke.
          </Link>
        </Alert>
      )}

      <ol className="grid gap-4">
        <Step n={1} title="Podpišite in naložite izjavo" done={statement !== null}>
          <p className="text-muted-foreground">
            Prenesite izpolnjeno izjavo, jo podpišite (lastnoročno in skenirajte ali z elektronskim
            podpisom) in jo naložite do {formatDateTime(auction.registrationDeadline)}.
          </p>
          <Button asChild variant="outline" className="w-fit">
            <a href={`/api/registrations/${r.id}/statement`}>
              <Download aria-hidden />
              Prenesi izjavo (PDF)
            </a>
          </Button>
          {statement && (
            <p>
              Naložena izjava:{' '}
              <a
                href={`/api/documents/${statement.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-2"
              >
                {statement.filename}
              </a>{' '}
              <span className="text-muted-foreground">({formatDateTime(statement.createdAt)})</span>
            </p>
          )}
          {canUploadStatement && (
            <StatementUpload registrationId={r.id} replace={statement !== null} />
          )}
        </Step>

        <Step n={2} title="Plačajte varščino" done={paid}>
          {paid ? (
            <p>Upravitelj je potrdil prejem varščine {formatCents(payment.amountCents)}.</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Varščino plačate neposredno na račun stečajnega dolžnika. V mobilni banki skenirajte
                kodo ali prepišite podatke – sklic mora biti naveden natanko tako.
              </p>
              <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG */}
                <img
                  src={`/api/registrations/${r.id}/upn-qr`}
                  alt="Koda UPN QR za plačilo varščine"
                  width={200}
                  height={200}
                  className="rounded-lg border bg-white p-1"
                />
                <dl className="grid gap-2">
                  <PayRow label="Znesek">{formatCents(payment.amountCents)}</PayRow>
                  <PayRow label="Prejemnik">
                    {payment.payeeName}
                    <span className="block font-normal text-muted-foreground">
                      {[payment.payeeAddress, payment.payeeCity].filter(Boolean).join(', ')}
                    </span>
                  </PayRow>
                  <PayRow label="IBAN">
                    <span className="font-mono">{formatIban(payment.payeeIban)}</span>
                  </PayRow>
                  <PayRow label="Sklic">
                    <span className="font-mono">{payment.reference}</span>
                  </PayRow>
                  <PayRow label="Namen">{payment.purpose}</PayRow>
                  <PayRow label="Koda namena">OTHR</PayRow>
                  <PayRow label="Rok plačila">{formatDateTime(payment.dueDate)}</PayRow>
                </dl>
              </div>
              <p className="text-xs text-muted-foreground">
                Plačilo potrdi upravitelj po prejemu na račun, kar lahko traja dan ali dva.
                Platforma Domik denarja ne sprejema.
              </p>
            </>
          )}
        </Step>

        <Step n={3} title="Potrditev upravitelja" done={r.status === 'APPROVED'}>
          <ul className="grid gap-1.5">
            {[
              { ok: identityStatus === 'VERIFIED', text: 'Identiteta preverjena' },
              { ok: statement !== null, text: 'Podpisana izjava naložena' },
              { ok: paid, text: 'Varščina plačana' },
              { ok: r.status === 'APPROVED', text: 'Prijava potrjena' },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-2">
                {item.ok ? (
                  <Check className="size-4 text-emerald-700" aria-label="Da" />
                ) : (
                  <Circle className="size-4 text-muted-foreground/50" aria-label="Še ne" />
                )}
                <span className={item.ok ? '' : 'text-muted-foreground'}>{item.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            O potrditvi ali zavrnitvi vas obvestimo po e-pošti.
          </p>
        </Step>
      </ol>
    </>
  );
}
