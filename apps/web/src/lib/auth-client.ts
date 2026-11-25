'use client';
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins';
import type { Auth } from '@/server/auth';

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), inferAdditionalFields<Auth>()],
});

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Napačen e-poštni naslov ali geslo.',
  EMAIL_NOT_VERIFIED: 'E-poštni naslov še ni potrjen.',
  USER_ALREADY_EXISTS: 'Uporabnik s tem e-poštnim naslovom že obstaja.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Uporabnik s tem e-poštnim naslovom že obstaja.',
  PASSWORD_TOO_SHORT: 'Geslo je prekratko (vsaj 10 znakov).',
  PASSWORD_TOO_LONG: 'Geslo je predolgo.',
  INVALID_EMAIL: 'Neveljaven e-poštni naslov.',
  INVALID_OTP: 'Napačna koda.',
  OTP_EXPIRED: 'Koda je potekla. Zahtevajte novo.',
  TOO_MANY_ATTEMPTS: 'Preveč poskusov. Zahtevajte novo kodo.',
};

export function authErrorMessage(error: { code?: string; status?: number } | null): string {
  if (error?.status === 429) return 'Preveč zahtev. Poskusite znova čez nekaj trenutkov.';
  return (error?.code && MESSAGES[error.code]) ?? 'Prišlo je do napake. Poskusite znova.';
}
