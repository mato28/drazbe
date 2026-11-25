import { publicService } from '@domik/core';
import { FileCheck2, Gavel, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuctionCard } from '@/components/public/auction-card';
import { Button } from '@/components/ui/button';
import { SITE_DESCRIPTION, SITE_TAGLINE } from '@/lib/site';
import { serviceContext } from '@/server/services';

export const metadata: Metadata = {
  title: { absolute: `Domik — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
};

const FEATURES = [
  {
    icon: FileCheck2,
    title: 'Vsa dokumentacija na enem mestu',
    text: 'Izpisek iz zemljiške knjige, cenitveno poročilo, fotografije in pogoji prodaje so objavljeni ob vsaki dražbi.',
  },
  {
    icon: ShieldCheck,
    title: 'Preverjeni dražitelji',
    text: 'Dražijo lahko le dražitelji s potrjeno identiteto in plačano varščino. Med seboj so anonimni.',
  },
  {
    icon: Gavel,
    title: 'Pregleden potek',
    text: 'Vsaka ponudba je zabeležena s časom strežnika in nespremenljivo shranjena v zapisniku dražbe.',
  },
] as const;

export default async function HomePage() {
  const list = await publicService.listPublicAuctions(serviceContext(), { stran: 1 }, 6);

  return (
    <main>
      <section className="border-b bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {SITE_TAGLINE}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Pregledna in varna spletna platforma, na kateri stečajni upravitelji objavljajo javne
            dražbe nepremičnin iz stečajne mase, preverjeni dražitelji pa oddajajo zavezujoče
            ponudbe.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/drazbe">Aktualne dražbe</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/kako-deluje">Kako deluje</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Aktualne dražbe</h2>
          {list.total > list.items.length && (
            <Link href="/drazbe" className="text-sm underline underline-offset-4">
              Vse dražbe ({list.total})
            </Link>
          )}
        </div>
        {list.items.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            Trenutno ni objavljenih dražb.
          </p>
        ) : (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((a) => (
              <li key={a.id}>
                <AuctionCard auction={a} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4">
        <ul className="grid gap-5 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border p-5">
              <f.icon className="size-6 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
