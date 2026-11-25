import { registrationService } from '@domik/core';
import { renderDocumentPdf } from '@domik/pdf';
import { MAX_DOCUMENT_BYTES } from '@domik/shared';
import { BIDDER, handle, idParam, uploadedFile } from '@/server/api';
import { toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ registrationId: string }>;
}

/** The pre-filled statement as a PDF, for the bidder to sign. */
export function GET(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, BIDDER, async (actor) => {
    const id = await idParam(params, 'registrationId');
    const { content, filename } = await registrationService.getStatementContent(
      serviceContext(),
      actor,
      id,
    );
    const pdf = await renderDocumentPdf(content);
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}

/** Upload of the signed statement (scan or e-signed PDF). multipart/form-data: `file`. */
export function POST(request: Request, { params }: Ctx): Promise<Response> {
  return handle(
    request,
    BIDDER,
    async (actor) => {
      const id = await idParam(params, 'registrationId');
      const { filename, bytes } = await uploadedFile(request, MAX_DOCUMENT_BYTES);
      return toDocumentDto(
        await registrationService.uploadSignedStatement(serviceContext(), actor, id, {
          filename,
          bytes,
        }),
      );
    },
    201,
  );
}
