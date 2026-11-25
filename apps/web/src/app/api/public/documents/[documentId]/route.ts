import { publicService } from '@domik/core';
import { handlePublic, idParam } from '@/server/api';
import { serviceContext } from '@/server/services';

/**
 * Public download of a lot document / photo: redirects to a short-lived signed URL.
 * Only documents of lots with a published auction are served (decided in core).
 */
export function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  return handlePublic(async () => {
    const id = await idParam(params, 'documentId');
    const url = await publicService.getPublicDocumentDownloadUrl(serviceContext(), id);
    return new Response(null, {
      status: 302,
      // The signed URL lives 5 min; let browsers reuse the redirect for a bit less.
      headers: { Location: url, 'Cache-Control': 'public, max-age=240' },
    });
  });
}
