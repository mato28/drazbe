import { refundService } from '@domik/core';
import { refundIbanSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE_OR_BIDDER } from '@/server/api';
import { serviceContext } from '@/server/services';

/** The bidder (own registration) or the trustee sets the account for the deposit refund. */
export function PUT(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(request, TRUSTEE_OR_BIDDER, async (actor) => {
    const id = await idParam(params, 'registrationId');
    const { iban } = await jsonBody(request, refundIbanSchema);
    const row = await refundService.setRefundIban(serviceContext(), actor, id, iban);
    return { refundIban: row.refundIban };
  });
}
