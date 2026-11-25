import { biddingService } from '@domik/core';
import { priceCommandSchema } from '@domik/shared';
import { BIDDER, handle, idParam, jsonBody } from '@/server/api';
import { toBidResultDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

/** PREEMPTION: a pre-emption holder matches the highest bid. */
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
        await biddingService.matchAsPreemptionHolder(serviceContext(), actor, id, input),
      );
    },
    201,
  );
}
