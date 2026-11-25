import { requireBiddingAccess } from '@domik/core';
import { biddingAccessSchema } from '@domik/shared';
import { BIDDER, handle, idParam } from '@/server/api';
import { serviceContext } from '@/server/services';

/** 200 with the bidder's pseudonym if they may bid in this auction, otherwise 403. */
export function GET(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  return handle(request, BIDDER, async (actor) => {
    const id = await idParam(params, 'auctionId');
    return biddingAccessSchema.parse(await requireBiddingAccess(serviceContext(), actor, id));
  });
}
