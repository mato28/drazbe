import { biddingService } from '@domik/core';
import { priceCommandSchema } from '@domik/shared';
import { BIDDER, handle, idParam, jsonBody } from '@/server/api';
import { toBidResultDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

/** DESCENDING: accept the current price level. */
export function POST(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  return handle(
    request,
    BIDDER,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      const input = await jsonBody(request, priceCommandSchema);
      return toBidResultDto(
        await biddingService.acceptCurrentPrice(serviceContext(), actor, id, input),
      );
    },
    201,
  );
}
