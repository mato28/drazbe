import { bidderService, documentService } from '@domik/core';
import { handle, idParam, TRUSTEE_OR_BIDDER } from '@/server/api';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ documentId: string }>;
}

/** Redirects to a short-lived signed download URL. Core decides who may read which document. */
export function GET(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE_OR_BIDDER, async (actor) => {
    const id = await idParam(params, 'documentId');
    const url = await documentService.getDocumentDownloadUrl(serviceContext(), actor, id);
    return new Response(null, {
      status: 302,
      headers: { Location: url, 'Cache-Control': 'no-store' },
    });
  });
}

/** A trustee deletes a lot document; a bidder deletes one of their own profile documents. */
export function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE_OR_BIDDER, async (actor) => {
    const id = await idParam(params, 'documentId');
    if (actor.role === 'TRUSTEE') {
      await documentService.deleteLotDocument(serviceContext(), actor, id);
    } else {
      await bidderService.deleteDocument(serviceContext(), actor, id);
    }
    return new Response(null, { status: 204 });
  });
}
