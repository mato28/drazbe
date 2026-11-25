import { registrationService } from '@domik/core';
import { BIDDER, handle, idParam, TRUSTEE } from '@/server/api';
import { toRegistrationDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee: all registrations of one of their auctions. */
export function GET(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'auctionId');
    const rows = await registrationService.listAuctionRegistrations(serviceContext(), actor, id);
    return { registrations: rows.map((r) => toRegistrationDto(r.registration, r.bidder.status)) };
  });
}

/** Bidder: register for the auction (assigns the pseudonym and the deposit sklic). */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(
    request,
    BIDDER,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      const ctx = serviceContext();
      const row = await registrationService.registerForAuction(ctx, actor, id);
      const mine = await registrationService.getMyRegistrationForAuction(ctx, actor, id);
      return toRegistrationDto(row, mine?.identityStatus ?? 'PENDING');
    },
    201,
  );
}
