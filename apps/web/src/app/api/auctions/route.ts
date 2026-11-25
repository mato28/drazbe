import { auctionService } from '@domik/core';
import { handle, TRUSTEE } from '@/server/api';
import { toAuctionDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

/** The signed-in trustee's own auctions. */
export function GET(request: Request): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => ({
    auctions: (await auctionService.listAuctions(serviceContext(), actor)).map(toAuctionDto),
  }));
}
