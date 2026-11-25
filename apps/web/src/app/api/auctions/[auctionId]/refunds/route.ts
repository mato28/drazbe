import { refundService } from '@domik/core';
import { markRefundedSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee: the bank executed the refunds — mark the deposits as refunded. */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'auctionId');
    const { registrationIds } = await jsonBody(request, markRefundedSchema);
    const count = await refundService.markRefunded(serviceContext(), actor, id, registrationIds);
    return { count };
  });
}
