import 'server-only';
import { type Area, canAccessArea, homeAreaFor, isRole, type Role } from '@domik/core';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AREA_PATH, LOGIN_PATH } from '@/lib/areas';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/**
 * Authoritative session lookup: bypasses the cookie cache so role changes and revoked
 * sessions take effect immediately.
 */
export async function getSessionUser(requestHeaders?: Headers): Promise<SessionUser | null> {
  // Read request headers first: this marks the route dynamic before any config/DB access.
  const hdrs = requestHeaders ?? (await headers());
  const session = await auth().api.getSession({
    headers: hdrs,
    query: { disableCookieCache: true },
  });
  if (!session || !isRole(session.user.role)) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role };
}

/** For pages/layouts: redirects when not signed in or not allowed in `area`. */
export async function requireArea(area: Area, currentPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`${LOGIN_PATH}?naprej=${encodeURIComponent(currentPath)}`);
  if (!canAccessArea(user.role, area)) redirect(AREA_PATH[homeAreaFor(user.role)]);
  return user;
}

/** For route handlers: returns the user, or a 401/403 JSON response. */
export async function requireApiRole(
  request: Request,
  roles: readonly Role[],
): Promise<SessionUser | Response> {
  const user = await getSessionUser(request.headers);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (!roles.includes(user.role)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  return user;
}
