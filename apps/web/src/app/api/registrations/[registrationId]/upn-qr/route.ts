import { qrMatrixToSvg, registrationService, upnQrMatrix } from '@domik/core';
import { BIDDER, handle, idParam } from '@/server/api';
import { serviceContext } from '@/server/services';

/** UPN QR code (SVG) for paying the deposit of the bidder's own registration. */
export function GET(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(request, BIDDER, async (actor) => {
    const id = await idParam(params, 'registrationId');
    const payment = await registrationService.getMyDepositPayment(serviceContext(), actor, id);
    return new Response(qrMatrixToSvg(upnQrMatrix(payment.upnQrPayload)), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' },
    });
  });
}
