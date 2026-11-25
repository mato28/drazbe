import { type ServerTimeDto } from '@domik/shared';
import { serviceContext } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Server time, for the client to estimate its clock offset (countdowns follow server time). */
export function GET(): Response {
  const body: ServerTimeDto = { serverTime: serviceContext().clock.now().toISOString() };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
