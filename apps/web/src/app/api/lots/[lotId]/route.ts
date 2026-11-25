import { lotService } from '@domik/core';
import { lotInputSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toAuctionDto, toDocumentDto, toLotDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ lotId: string }>;
}

export function GET(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const d = await lotService.getLot(serviceContext(), actor, await idParam(params, 'lotId'));
    return {
      lot: toLotDto(d.lot),
      documents: d.documents.map(toDocumentDto),
      auctions: d.auctions.map(toAuctionDto),
      locked: d.locked,
    };
  });
}

export function PUT(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const lotId = await idParam(params, 'lotId');
    const input = await jsonBody(request, lotInputSchema);
    return toLotDto(await lotService.updateLot(serviceContext(), actor, lotId, input));
  });
}
