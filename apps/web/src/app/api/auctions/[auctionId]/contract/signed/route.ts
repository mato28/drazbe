import { saleService } from '@domik/core';
import { MAX_DOCUMENT_BYTES } from '@domik/shared';
import { handle, idParam, TRUSTEE, uploadedFile } from '@/server/api';
import { toDocumentDto, toSaleDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee: uploads the contract with both signatures (multipart `file`); concludes the contract. */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      const { filename, bytes } = await uploadedFile(request, MAX_DOCUMENT_BYTES);
      const r = await saleService.uploadTrusteeSignedContract(serviceContext(), actor, id, {
        filename,
        bytes,
      });
      return { document: toDocumentDto(r.document), check: r.check, sale: toSaleDto(r.sale) };
    },
    201,
  );
}
