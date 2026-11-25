import { saleService } from '@domik/core';
import { declareDefaultSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toSaleDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee: the buyer missed a deadline — the sale is defaulted and the deposit forfeited. */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'auctionId');
    const { reason } = await jsonBody(request, declareDefaultSchema);
    return toSaleDto(await saleService.declareDefault(serviceContext(), actor, id, reason));
  });
}
