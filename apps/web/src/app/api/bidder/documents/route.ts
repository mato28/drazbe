import { bidderService } from '@domik/core';
import { bidderDocumentKindSchema, MAX_DOCUMENT_BYTES } from '@domik/shared';
import { BIDDER, handle, parse, uploadedFile } from '@/server/api';
import { toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

/** multipart/form-data: `file` + `kind` (ID document, power of attorney, registry extract). */
export function POST(request: Request): Promise<Response> {
  return handle(
    request,
    BIDDER,
    async (actor) => {
      const { filename, bytes, form } = await uploadedFile(request, MAX_DOCUMENT_BYTES);
      const kind = parse(bidderDocumentKindSchema, form.get('kind'));
      return toDocumentDto(
        await bidderService.uploadDocument(serviceContext(), actor, { kind, filename, bytes }),
      );
    },
    201,
  );
}
