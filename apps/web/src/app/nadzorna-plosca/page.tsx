import { homeAreaFor } from '@domik/core';
import { redirect } from 'next/navigation';
import { AREA_PATH, LOGIN_PATH } from '@/lib/areas';
import { getSessionUser } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Sends a signed-in user to the home of their role. */
export default async function DashboardRedirect() {
  const user = await getSessionUser();
  redirect(user ? AREA_PATH[homeAreaFor(user.role)] : LOGIN_PATH);
}
