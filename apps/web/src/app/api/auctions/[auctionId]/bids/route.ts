import { biddingService } from '@domik/core';
import { placeBidSchema } from '@domik/shared';
import { BIDDER, handle, idParam, jsonBody } from '@/server/api';
import { toBidResultDto } from '@/server/dto';
import { enforceRateLimit } from '@/server/rate-limit';
import { serviceContext } from '@/server/services';

/** Place a binding bid (ASCENDING, or DESCENDING continued as ascending). */
export function POST(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  return handle(
    request,
    BIDDER,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      enforceRateLimit('bid', `user:${actor.userId}`);
      const input = await jsonBody(request, placeBidSchema);
      return toBidResultDto(await biddingService.placeBid(serviceContext(), actor, id, input));
    },
    201,
  );
}
