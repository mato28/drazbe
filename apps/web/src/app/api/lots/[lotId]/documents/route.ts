import { documentService } from '@domik/core';
import { lotDocumentKindSchema, MAX_DOCUMENT_BYTES } from '@domik/shared';
import { handle, idParam, parse, TRUSTEE, uploadedFile } from '@/server/api';
import { toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

/** multipart/form-data: `file` + `kind`. The server computes the sha256 of what it stores. */
export function POST(
  request: Request,
  { params }: { params: Promise<{ lotId: string }> },
): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const lotId = await idParam(params, 'lotId');
      const { filename, bytes, form } = await uploadedFile(request, MAX_DOCUMENT_BYTES);
      const kind = parse(lotDocumentKindSchema, form.get('kind'));
      const doc = await documentService.uploadLotDocument(serviceContext(), actor, {
        lotId,
        kind,
        filename,
        bytes,
      });
      return toDocumentDto(doc);
    },
    201,
  );
}
