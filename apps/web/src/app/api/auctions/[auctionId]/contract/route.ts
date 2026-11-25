import { saleService } from '@domik/core';
import { contractTermsSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee: (re)generates the sale contract PDF from the template, with optional payment terms. */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      const terms = await jsonBody(request, contractTermsSchema);
      return toDocumentDto(await saleService.generateContract(serviceContext(), actor, id, terms));
    },
    201,
  );
}
