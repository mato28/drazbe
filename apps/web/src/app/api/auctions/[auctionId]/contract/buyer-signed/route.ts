import { saleService } from '@domik/core';
import { MAX_DOCUMENT_BYTES } from '@domik/shared';
import { BIDDER, handle, idParam, uploadedFile } from '@/server/api';
import { toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/**
 * Buyer: uploads the contract signed with a qualified electronic signature (multipart `file`).
 * The signature is validated by EU DSS before the file is accepted.
 */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(
    request,
    BIDDER,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      const { filename, bytes } = await uploadedFile(request, MAX_DOCUMENT_BYTES);
      const r = await saleService.uploadBuyerSignedContract(serviceContext(), actor, id, {
        filename,
        bytes,
      });
      return { document: toDocumentDto(r.document), check: r.check };
    },
    201,
  );
}
