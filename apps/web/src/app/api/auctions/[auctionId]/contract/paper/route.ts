import { saleService } from '@domik/core';
import { MAX_DOCUMENT_BYTES, paperSignedFieldsSchema } from '@domik/shared';
import { handle, idParam, parse, TRUSTEE, uploadedFile } from '@/server/api';
import { toDocumentDto, toSaleDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ auctionId: string }>;
}

/** Trustee fallback: contract signed on paper. multipart: `file` (scan) + `signedAt` (ISO). */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const id = await idParam(params, 'auctionId');
      const { filename, bytes, form } = await uploadedFile(request, MAX_DOCUMENT_BYTES);
      const { signedAt } = parse(paperSignedFieldsSchema, { signedAt: form.get('signedAt') });
      const r = await saleService.markSignedOnPaper(serviceContext(), actor, id, {
        filename,
        bytes,
        signedAt,
      });
      return { document: toDocumentDto(r.document), sale: toSaleDto(r.sale) };
    },
    201,
  );
}
