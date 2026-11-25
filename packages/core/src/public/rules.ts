import { formatCents } from '@domik/shared';
import { type AuctionConfig, descendingSchedule } from '../auctions/config';

function duration(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} h`;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return `${sec} s`;
}

/**
 * Plain-language summary of how this auction runs, generated from its parameters
 * (so the published rules can never drift from what the engine does).
 */
export function auctionRulesSummary(c: AuctionConfig): string[] {
  const rules: string[] = [];
  const ascendingPhase = c.type === 'ASCENDING' || c.switchToAscendingOnAccept;

  if (c.type === 'ASCENDING') {
    rules.push(
      `Dražba poteka z zviševanjem izklicne cene. Prva ponudba mora biti najmanj ${formatCents(c.startingPriceCents)}.`,
    );
  } else {
    const schedule = descendingSchedule(c);
    rules.push(
      `Dražba poteka z zniževanjem izklicne cene. Cena se začne pri ${formatCents(c.startingPriceCents)}` +
        (c.priceDecrementCents !== null && c.stepDurationSec !== null
          ? ` in se vsakih ${duration(c.stepDurationSec)} zniža za ${formatCents(c.priceDecrementCents)}`
          : '') +
        (c.floorPriceCents !== null ? `, vendar ne pod ${formatCents(c.floorPriceCents)}.` : '.'),
    );
    rules.push(
      c.switchToAscendingOnAccept
        ? 'Ko prvi dražitelj sprejme trenutno ceno, se dražba nadaljuje z zviševanjem: drugi dražitelji lahko sprejeto ceno presežejo.'
        : 'Uspe dražitelj, ki prvi sprejme trenutno ceno. S sprejemom cene je dražba končana.',
    );
    if (schedule) {
      rules.push('Če nobeden od dražiteljev ne sprejme niti najnižje cene, je dražba neuspešna.');
    }
  }

  if (ascendingPhase && c.bidIncrementCents !== null) {
    rules.push(
      `Vsaka naslednja ponudba mora biti od trenutne najvišje ponudbe višja najmanj za korak draženja ${formatCents(c.bidIncrementCents)}.`,
    );
  }
  if (c.type === 'ASCENDING') {
    rules.push(
      'Uspe dražitelj, ki do izteka časa odda najvišjo veljavno ponudbo. Če ni nobene ponudbe, je dražba neuspešna.',
    );
  }
  if (ascendingPhase && c.extensionWindowSec > 0) {
    rules.push(
      `Če je ponudba oddana v zadnjih ${duration(c.extensionWindowSec)} pred iztekom, se dražba podaljša za ${duration(c.extensionSec)} od trenutka ponudbe. Podaljšanje se lahko ponovi večkrat.`,
    );
  }

  rules.push(
    'Ponudbe so zavezujoče in jih ni mogoče preklicati. Za čas oddaje ponudbe velja čas strežnika.',
  );
  rules.push(
    `Dražijo lahko samo dražitelji, ki se pravočasno prijavijo, jih upravitelj potrdi in ki do roka plačajo varščino ${formatCents(c.depositCents)} na račun stečajnega dolžnika.`,
  );
  rules.push(
    'Dražitelji so med seboj anonimni; pri ponudbah je prikazana le oznaka dražitelja (npr. »Dražitelj 3«).',
  );
  if (c.preemptionEnabled) {
    rules.push(
      `Na predmetu prodaje obstaja predkupna pravica. Predkupni upravičenec lahko v ${duration(c.preemptionWindowSec)} po koncu dražbe izenači najvišjo ponudbo in s tem postane kupec.`,
    );
  }
  return rules;
}
