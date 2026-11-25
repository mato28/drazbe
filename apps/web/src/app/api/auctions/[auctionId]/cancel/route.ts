import { auctionService } from '@domik/core';
import { auctionReasonSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toAuctionDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

export function POST(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'auctionId');
    const { reason } = await jsonBody(request, auctionReasonSchema);
    return toAuctionDto(await auctionService.cancelAuction(serviceContext(), actor, id, reason));
  });
}
