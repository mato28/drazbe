import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/site/prose-page';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Kako deluje',
  description:
    'Kako poteka spletna javna dražba nepremičnine iz stečajnega postopka: registracija, prijava na dražbo, varščina, draženje in plačilo kupnine.',
  alternates: { canonical: '/kako-deluje' },
};

export default function HowItWorksPage() {
  return (
    <ProsePage
      title="Kako deluje"
      lead="Od ogleda dokumentacije do plačila kupnine – potek spletne javne dražbe v šestih korakih."
    >
      <h2>Za dražitelje</h2>
      <ol>
        <li>
          <strong>Izberite dražbo.</strong> Na strani{' '}
          <Link href="/drazbe" className="underline underline-offset-2">
            Dražbe
          </Link>{' '}
          so objavljene vse aktualne dražbe z opisom nepremičnine, dokumentacijo, izklicno ceno,
          višino varščine in roki.
        </li>
        <li>
          <strong>Ustvarite račun.</strong> Registrirate se z e-poštnim naslovom in ga potrdite s
          kodo, ki jo prejmete po e-pošti. Nato vnesete podatke fizične ali pravne osebe.
        </li>
        <li>
          <strong>Prijavite se na dražbo.</strong> Do roka za prijavo oddate prijavo in podpišete
          izjavo, da niste oseba, ki po zakonu ne sme kupiti premoženja stečajnega dolžnika.
        </li>
        <li>
          <strong>Plačajte varščino.</strong> Varščino plačate neposredno na račun stečajnega
          dolžnika s sklicem, ki ga prejmete ob prijavi. Platforma denarja ne sprejema in ne hrani.
          Upravitelj po prejemu plačila vašo prijavo potrdi.
        </li>
        <li>
          <strong>Dražite.</strong> Ob začetku dražbe oddajate ponudbe prek spleta. Ponudbe so
          zavezujoče. Drugi dražitelji vidijo le vašo oznako (npr. »Dražitelj 3«), ne vaše
          identitete.
        </li>
        <li>
          <strong>Po dražbi.</strong> Najboljši ponudnik sklene prodajno pogodbo in plača kupnino na
          račun stečajnega dolžnika. Dražiteljem, ki niso uspeli, se varščina vrne.
        </li>
      </ol>

      <h2>Vrsti dražb</h2>
      <ul>
        <li>
          <strong>Dražba z zviševanjem izklicne cene.</strong> Dražitelji višajo ponudbe za najmanj
          korak draženja. Uspe najvišja ponudba ob izteku časa. Ponudba tik pred koncem dražbo
          podaljša, da imajo drugi čas za odziv.
        </li>
        <li>
          <strong>Dražba z zniževanjem izklicne cene.</strong> Cena se v enakih časovnih korakih
          znižuje do najnižje cene. Uspe dražitelj, ki prvi sprejme trenutno ceno.
        </li>
      </ul>
      <p>Natančna pravila posamezne dražbe so vedno navedena na strani dražbe.</p>

      <h2>Za stečajne upravitelje</h2>
      <p>
        Upravitelj vnese stečajni postopek in predmet prodaje, naloži dokumentacijo, določi
        parametre dražbe in jo objavi. Platforma vodi prijave dražiteljev, potek dražbe in zapisnik
        o dražbi. Za dostop se obrnite na skrbnika platforme.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/drazbe">Oglejte si dražbe</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/registracija">Registracija dražitelja</Link>
        </Button>
      </div>
    </ProsePage>
  );
}
