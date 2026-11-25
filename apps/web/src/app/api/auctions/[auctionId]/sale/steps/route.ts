import { saleService } from '@domik/core';
import { saleStepSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toSaleDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee: records the next post-sale step (payment received, transfer order, ZK entry). */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'auctionId');
    const { step, at, reference } = await jsonBody(request, saleStepSchema);
    const sale = await saleService.recordSaleStep(serviceContext(), actor, id, {
      step,
      ...(at ? { at } : {}),
      ...(reference ? { reference } : {}),
    });
    return toSaleDto(sale);
  });
}
