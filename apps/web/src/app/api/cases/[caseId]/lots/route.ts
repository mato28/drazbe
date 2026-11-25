import { lotService } from '@domik/core';
import { lotInputSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toLotDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

export function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const caseId = await idParam(params, 'caseId');
      const input = await jsonBody(request, lotInputSchema);
      return toLotDto(await lotService.createLot(serviceContext(), actor, caseId, input));
    },
    201,
  );
}
