import { z } from 'zod';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export const OTP_TYPES = [
  'email-verification',
  'sign-in',
  'forget-password',
  'change-email',
] as const;

const templates = {
  'auth.otp': z.object({
    otp: z.string().regex(/^\d{4,10}$/),
    type: z.enum(OTP_TYPES),
    expiresInMinutes: z.number().int().positive(),
  }),
  'registration.received': z.object({
    lotTitle: z.string(),
    pseudonym: z.string(),
    registrationDeadline: z.string(),
    depositAmount: z.string(),
    paymentReference: z.string(),
    url: z.string(),
  }),
  'registration.approved': z.object({
    lotTitle: z.string(),
    pseudonym: z.string(),
    startsAt: z.string(),
    url: z.string(),
  }),
  'registration.rejected': z.object({ lotTitle: z.string(), reason: z.string(), url: z.string() }),
  'deposit.confirmed': z.object({
    lotTitle: z.string(),
    depositAmount: z.string(),
    url: z.string(),
  }),
  'auction.won': z.object({
    lotTitle: z.string(),
    price: z.string(),
    contractDeadline: z.string(),
    url: z.string(),
  }),
  'auction.lost': z.object({ lotTitle: z.string(), depositAmount: z.string(), url: z.string() }),
  'auction.closed': z.object({
    lotTitle: z.string(),
    outcome: z.string(),
    reason: z.string(),
    depositAmount: z.string(),
    url: z.string(),
  }),
  'auction.result': z.object({
    lotTitle: z.string(),
    outcome: z.string(),
    price: z.string(),
    url: z.string(),
  }),
  'sale.contract_ready': z.object({
    lotTitle: z.string(),
    contractDeadline: z.string(),
    url: z.string(),
  }),
  'sale.reminder': z.object({
    lotTitle: z.string(),
    task: z.string(),
    deadline: z.string(),
    url: z.string(),
  }),
  'sale.overdue': z.object({
    lotTitle: z.string(),
    task: z.string(),
    deadline: z.string(),
    forTrustee: z.boolean(),
    url: z.string(),
  }),
  'sale.defaulted': z.object({ lotTitle: z.string(), reason: z.string(), url: z.string() }),
  'deposit.refunded': z.object({ lotTitle: z.string(), amount: z.string(), url: z.string() }),
} satisfies Record<string, z.ZodType>;

export type TemplateName = keyof typeof templates;
export type TemplatePayload<T extends TemplateName> = z.infer<(typeof templates)[T]>;

export function isTemplateName(name: string): name is TemplateName {
  return Object.hasOwn(templates, name);
}

const OTP_PURPOSE: Record<(typeof OTP_TYPES)[number], { subject: string; intro: string }> = {
  'email-verification': {
    subject: 'Potrditev e-poštnega naslova',
    intro: 'za potrditev vašega e-poštnega naslova vnesite naslednjo kodo:',
  },
  'sign-in': {
    subject: 'Koda za prijavo',
    intro: 'za prijavo v vaš račun vnesite naslednjo kodo:',
  },
  'forget-password': {
    subject: 'Ponastavitev gesla',
    intro: 'za ponastavitev gesla vnesite naslednjo kodo:',
  },
  'change-email': {
    subject: 'Sprememba e-poštnega naslova',
    intro: 'za potrditev spremembe e-poštnega naslova vnesite naslednjo kodo:',
  },
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

function renderOtp(p: TemplatePayload<'auth.otp'>): RenderedEmail {
  const purpose = OTP_PURPOSE[p.type];
  const footer =
    'Če te zahteve niste podali vi, to sporočilo prezrite. Kode nikoli ne posredujte drugim osebam.';
  const validity = `Koda velja ${p.expiresInMinutes} min.`;
  return {
    subject: `${purpose.subject} – Domik`,
    text: `Pozdravljeni,\n\n${purpose.intro}\n\n${p.otp}\n\n${validity}\n\n${footer}\n\nDomik`,
    html: `<!doctype html><html lang="sl"><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
<p>Pozdravljeni,</p>
<p>${escapeHtml(purpose.intro)}</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px;font-family:ui-monospace,monospace">${escapeHtml(p.otp)}</p>
<p>${escapeHtml(validity)}</p>
<p style="color:#666;font-size:13px">${escapeHtml(footer)}</p>
<p>Domik</p>
</body></html>`,
  };
}

/** Simple transactional email: greeting, paragraphs, optional link. */
function message(
  subject: string,
  paragraphs: string[],
  link?: { label: string; url: string },
): RenderedEmail {
  const text = [
    'Pozdravljeni,',
    ...paragraphs,
    ...(link ? [`${link.label}: ${link.url}`] : []),
    'Domik',
  ].join('\n\n');
  const html = `<!doctype html><html lang="sl"><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
<p>Pozdravljeni,</p>
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
${link ? `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>` : ''}
<p>Domik</p>
</body></html>`;
  return { subject: `${subject} – Domik`, text, html };
}

const renderers: Record<TemplateName, (payload: unknown) => RenderedEmail> = {
  'auth.otp': (payload) => renderOtp(templates['auth.otp'].parse(payload)),
  'registration.received': (payload) => {
    const p = templates['registration.received'].parse(payload);
    return message(
      'Prijava na dražbo je prejeta',
      [
        `prejeli smo vašo prijavo na dražbo »${p.lotTitle}«. Na dražbi boste nastopali pod oznako ${p.pseudonym}.`,
        `Da bo prijava popolna, do ${p.registrationDeadline} naložite podpisano izjavo in plačajte varščino ${p.depositAmount} s sklicem ${p.paymentReference}. Podatki za plačilo in koda UPN QR so na strani prijave.`,
        'Upravitelj bo prijavo potrdil, ko bodo preverjeni vaša identiteta, izjava in plačilo varščine.',
      ],
      { label: 'Odpri prijavo', url: p.url },
    );
  },
  'registration.approved': (payload) => {
    const p = templates['registration.approved'].parse(payload);
    return message(
      'Prijava na dražbo je potrjena',
      [
        `upravitelj je potrdil vašo prijavo na dražbo »${p.lotTitle}«.`,
        `Dražba se začne ${p.startsAt}. Dražili boste pod oznako ${p.pseudonym}.`,
      ],
      { label: 'Odpri prijavo', url: p.url },
    );
  },
  'registration.rejected': (payload) => {
    const p = templates['registration.rejected'].parse(payload);
    return message(
      'Prijava na dražbo je zavrnjena',
      [`upravitelj je zavrnil vašo prijavo na dražbo »${p.lotTitle}«.`, `Razlog: ${p.reason}`],
      { label: 'Odpri prijavo', url: p.url },
    );
  },
  'deposit.confirmed': (payload) => {
    const p = templates['deposit.confirmed'].parse(payload);
    return message(
      'Plačilo varščine je potrjeno',
      [`upravitelj je potrdil prejem varščine ${p.depositAmount} za dražbo »${p.lotTitle}«.`],
      { label: 'Odpri prijavo', url: p.url },
    );
  },
  'auction.won': (payload) => {
    const p = templates['auction.won'].parse(payload);
    return message(
      'Vaša ponudba je bila najvišja',
      [
        `na dražbi »${p.lotTitle}« je bila vaša ponudba ${p.price} najvišja.`,
        `Upravitelj bo pripravil prodajno pogodbo. Podpisati jo morate do ${p.contractDeadline}. Vplačana varščina se všteje v kupnino.`,
        'Če pogodbe ne podpišete ali kupnine ne plačate v roku, varščina zapade v korist stečajne mase.',
      ],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
  'auction.lost': (payload) => {
    const p = templates['auction.lost'].parse(payload);
    return message(
      'Dražba je zaključena',
      [
        `dražba »${p.lotTitle}« je zaključena. Vaša ponudba ni bila najvišja.`,
        `Varščino ${p.depositAmount} vam bo upravitelj vrnil na vaš račun. Če številke računa za vračilo še niste vnesli, jo vnesite na strani dražbe.`,
      ],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
  'auction.closed': (payload) => {
    const p = templates['auction.closed'].parse(payload);
    return message(
      'Dražba je zaključena',
      [
        `dražba »${p.lotTitle}« je ${p.outcome}.`,
        ...(p.reason ? [`Razlog: ${p.reason}`] : []),
        `Plačano varščino ${p.depositAmount} vam bo upravitelj vrnil. Če številke računa za vračilo še niste vnesli, jo vnesite na strani dražbe.`,
      ],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
  'auction.result': (payload) => {
    const p = templates['auction.result'].parse(payload);
    return message(
      'Izid dražbe',
      [
        `dražba »${p.lotTitle}« je ${p.outcome}${p.price ? `, najvišja ponudba ${p.price}` : ''}.`,
        'Zapisnik o dražbi bo na voljo v nekaj minutah. Vračila varščin in prodajo urejate na strani dražbe.',
      ],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
  'sale.contract_ready': (payload) => {
    const p = templates['sale.contract_ready'].parse(payload);
    return message(
      'Prodajna pogodba je pripravljena',
      [
        `prodajna pogodba za »${p.lotTitle}« je pripravljena.`,
        `Prenesite jo, podpišite s kvalificiranim elektronskim podpisom (npr. SI-PASS ali lastno kvalificirano potrdilo) in jo naložite nazaj do ${p.contractDeadline}.`,
      ],
      { label: 'Odpri pogodbo', url: p.url },
    );
  },
  'sale.reminder': (payload) => {
    const p = templates['sale.reminder'].parse(payload);
    return message(
      `Opomnik: ${p.task}`,
      [`za nakup »${p.lotTitle}« je rok za naslednji korak (${p.task}) ${p.deadline}.`],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
  'sale.overdue': (payload) => {
    const p = templates['sale.overdue'].parse(payload);
    return message(
      `Rok je potekel: ${p.task}`,
      p.forTrustee
        ? [
            `pri prodaji »${p.lotTitle}« je ${p.deadline} potekel rok (${p.task}), kupec pa obveznosti še ni izpolnil.`,
            'Če kupec obveznosti ne bo izpolnil, lahko na strani dražbe ugotovite neizpolnitev in zadržite varščino.',
          ]
        : [
            `pri nakupu »${p.lotTitle}« je ${p.deadline} potekel rok (${p.task}).`,
            'Obveznost izpolnite čim prej in se obrnite na upravitelja. Ob neizpolnitvi varščina zapade v korist stečajne mase.',
          ],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
  'sale.defaulted': (payload) => {
    const p = templates['sale.defaulted'].parse(payload);
    return message(
      'Neizpolnitev obveznosti kupca',
      [
        `upravitelj je ugotovil, da obveznosti iz nakupa »${p.lotTitle}« niso bile izpolnjene. Varščina zapade v korist stečajne mase.`,
        `Razlog: ${p.reason}`,
      ],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
  'deposit.refunded': (payload) => {
    const p = templates['deposit.refunded'].parse(payload);
    return message(
      'Varščina je vrnjena',
      [`upravitelj je izvedel vračilo varščine ${p.amount} za dražbo »${p.lotTitle}«.`],
      { label: 'Odpri dražbo', url: p.url },
    );
  },
};

/** Validates the payload and renders the email. Throws on unknown template / bad payload. */
export function renderEmail(template: string, payload: unknown): RenderedEmail {
  if (!isTemplateName(template)) throw new Error(`Unknown email template "${template}"`);
  return renderers[template](payload);
}
