export const SITE_NAME = 'Domik';
export const SITE_TAGLINE = 'Javne dražbe premoženja v stečajnih postopkih';
export const SITE_DESCRIPTION =
  'Spletne javne dražbe nepremičnin iz stečajnih postopkov. Pregledno, varno in v skladu z ZFPPIPP: preverjeni dražitelji, zavezujoče ponudbe, celotna dokumentacija na enem mestu.';

export const PUBLIC_NAV = [
  { href: '/drazbe', label: 'Dražbe' },
  { href: '/kako-deluje', label: 'Kako deluje' },
] as const;

export const LEGAL_NAV = [
  { href: '/pogoji-uporabe', label: 'Pogoji uporabe' },
  { href: '/varstvo-osebnih-podatkov', label: 'Varstvo osebnih podatkov' },
] as const;

export const publicDocumentUrl = (id: string): string => `/api/public/documents/${id}`;

/** "58.40" -> "58,40 m²" */
export function formatArea(areaM2: string | null): string | null {
  return areaM2 === null ? null : `${areaM2.replace('.', ',').replace(/,00$/, '')} m²`;
}
