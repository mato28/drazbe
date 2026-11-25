import { DomainError, getLiveState, publicService } from '@domik/core';
import { AUCTION_TYPE_LABEL } from '@domik/shared';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { LiveAuction } from '@/components/live/live-auction';
import { toLiveStateDto } from '@/server/dto';
import { serviceContext } from '@/server/services';
import { getSessionUser } from '@/server/session';

const ROLE_LABEL = { ADMIN: 'administrator', TRUSTEE: 'upravitelj', BIDDER: 'dražitelj' } as const;

interface Props {
  params: Promise<{ auctionId: string }>;
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dražba v živo',
  robots: { index: false },
};

export default async function LiveAuctionPage({ params }: Props) {
  const { auctionId } = await params;
  const user = await getSessionUser();
  if (!z.uuid().safeParse(auctionId).success) notFound();

  const ctx = serviceContext();
  const actor = user ? { userId: user.id, role: user.role } : null;
  let detail;
  let state;
  try {
    [detail, state] = await Promise.all([
      publicService.getPublicAuction(ctx, auctionId),
      getLiveState(ctx, auctionId, actor),
    ]);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const here = `/drazbe/${auctionId}/v-zivo`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href={`/drazbe/${auctionId}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Podrobnosti dražbe
      </Link>
      <header className="mt-3 mb-6">
        <p className="text-sm text-muted-foreground">{AUCTION_TYPE_LABEL[detail.type]}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {detail.title}
        </h1>
      </header>
      <LiveAuction
        initial={toLiveStateDto(state)}
        signedIn={user !== null}
        signedInAs={user ? `${user.email} (${ROLE_LABEL[user.role]})` : null}
        loginHref={`/prijava?naprej=${encodeURIComponent(here)}`}
      />
      <p className="mt-6 text-xs text-muted-foreground">
        Ure so prikazane po strežniškem času (Europe/Ljubljana). Odločilen je trenutek, ko strežnik
        prejme ponudbo. Dražitelji so prikazani le s psevdonimi.
      </p>
    </main>
  );
}
