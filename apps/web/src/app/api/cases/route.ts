import { caseService } from '@domik/core';
import { caseInputSchema } from '@domik/shared';
import { handle, jsonBody, TRUSTEE } from '@/server/api';
import { toCaseDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

export function GET(request: Request): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => ({
    cases: (await caseService.listCases(serviceContext(), actor)).map(toCaseDto),
  }));
}

export function POST(request: Request): Promise<Response> {
  return handle(
    request,
    TRUSTEE,
    async (actor) => {
      const input = await jsonBody(request, caseInputSchema);
      return toCaseDto(await caseService.createCase(serviceContext(), actor, input));
    },
    201,
  );
}
