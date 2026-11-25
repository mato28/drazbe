import { type HealthResponse, healthResponseSchema } from '@domik/shared';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const body: HealthResponse = healthResponseSchema.parse({
    status: 'ok',
    service: 'web',
    time: new Date().toISOString(),
  });
  return Response.json(body);
}
