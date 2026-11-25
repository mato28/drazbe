import { handlePublic, idParam, optionalActor } from '@/server/api';
import { auctionStreamResponse } from '@/server/auction-stream';

export const dynamic = 'force-dynamic';

/** Server-sent events with the live state of the auction (see server/auction-stream.ts). */
export function GET(
  request: Request,
  { params }: { params: Promise<{ auctionId: string }> },
): Promise<Response> {
  return handlePublic(async () => {
    const id = await idParam(params, 'auctionId');
    return auctionStreamResponse(request, id, await optionalActor(request));
  });
}
