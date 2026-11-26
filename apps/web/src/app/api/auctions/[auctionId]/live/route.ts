import { getLiveState } from '@domik/core';
import { handlePublic, idParam, optionalActor } from '@/server/api';
import { toLiveStateDto } from '@/server/dto';
import { clientIp, enforceRateLimit } from '@/server/rate-limit';
import { serviceContext } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Current live state (public; `viewer` is filled for a signed-in registered bidder). */
export function GET(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  return handlePublic(async () => {
    const id = await idParam(params, 'auctionId');
    const actor = await optionalActor(request);
    enforceRateLimit('live', actor ? `user:${actor.userId}` : `ip:${clientIp(request)}`);
    return toLiveStateDto(await getLiveState(serviceContext(), id, actor));
  });
}
