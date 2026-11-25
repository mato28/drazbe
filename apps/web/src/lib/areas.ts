import { type Area } from '@domik/core';

/** URL prefix of each protected area (Slovenian paths). */
export const AREA_PATH: Record<Area, string> = {
  admin: '/admin',
  trustee: '/upravitelj',
  bidder: '/drazitelj',
};

export const LOGIN_PATH = '/prijava';
export const DASHBOARD_PATH = '/nadzorna-plosca';

export function areaForPath(pathname: string): Area | null {
  for (const [area, prefix] of Object.entries(AREA_PATH) as [Area, string][]) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return area;
  }
  return null;
}

/** Only allow same-site relative redirects (prevents open redirects via ?naprej=). */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}
