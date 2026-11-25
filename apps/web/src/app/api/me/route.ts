import { type MeResponse, meResponseSchema } from '@domik/shared';
import { getSessionUser } from '@/server/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request.headers);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body: MeResponse = meResponseSchema.parse(user);
  return Response.json(body);
}
