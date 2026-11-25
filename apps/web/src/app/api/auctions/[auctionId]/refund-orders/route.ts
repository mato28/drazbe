import { refundService } from '@domik/core';
import { refundOrderSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee: SEPA pain.001 refund order for all pending deposits (to upload to the e-bank). */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      const { executionDate } = await jsonBody(request, refundOrderSchema);
      const r = await refundService.generateRefundOrder(
        serviceContext(),
        actor,
        id,
        executionDate ? { executionDate } : {},
      );
      return {
        document: toDocumentDto(r.document),
        included: r.included.map((p) => ({
          pseudonym: p.pseudonym,
          amountCents: p.amountCents.toString(),
        })),
        missingIban: r.missingIban,
      };
    },
    201,
  );
}
