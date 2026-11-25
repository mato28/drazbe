import { auctionService } from '@domik/core';
import { auctionInputSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toAuctionDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

export function GET(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'auctionId');
    return toAuctionDto((await auctionService.getAuction(serviceContext(), actor, id)).auction);
  });
}

export function PUT(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'auctionId');
    const input = await jsonBody(request, auctionInputSchema);
    return toAuctionDto(await auctionService.updateAuction(serviceContext(), actor, id, input));
  });
}
