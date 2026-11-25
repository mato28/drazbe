// Optimistic, cookie-only access checks (no DB). The authoritative check is requireArea()
// in each area's layout — never rely on this file alone (see Next.js proxy docs).
import { canAccessArea, homeAreaFor, isRole } from '@domik/core';
import { getCookieCache, getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import { AREA_PATH, areaForPath, LOGIN_PATH } from '@/lib/areas';
import { serverConfig } from '@/server/config';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const area = areaForPath(pathname);
  if (!area) return NextResponse.next();

  const cfg = serverConfig();
  const cache = await getCookieCache(request, {
    secret: cfg.BETTER_AUTH_SECRET,
    isSecure: cfg.APP_URL.startsWith('https://'),
  });

  if (!cache) {
    // Cookie cache may simply have expired while the session is still valid: let the layout decide.
    if (getSessionCookie(request)) return NextResponse.next();
    const login = new URL(LOGIN_PATH, request.url);
    login.searchParams.set('naprej', pathname + search);
    return NextResponse.redirect(login);
  }

  const role = (cache.user as { role?: unknown }).role;
  if (!isRole(role)) return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  if (!canAccessArea(role, area)) {
    return NextResponse.redirect(new URL(AREA_PATH[homeAreaFor(role)], request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/upravitelj/:path*', '/drazitelj/:path*'],
};
