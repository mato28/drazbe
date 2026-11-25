import { auctionService } from '@domik/core';
import { auctionInputSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toAuctionDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

export function POST(
  request: Request,
  { params }: { params: Promise<{ lotId: string }> },
): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const lotId = await idParam(params, 'lotId');
      const input = await jsonBody(request, auctionInputSchema);
      return toAuctionDto(
        await auctionService.createAuction(serviceContext(), actor, lotId, input),
      );
    },
    201,
  );
}
