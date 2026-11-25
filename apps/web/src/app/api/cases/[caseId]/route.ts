import { caseService } from '@domik/core';
import { caseInputSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { toCaseDto, toLotDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

interface Ctx {
  params: Promise<{ caseId: string }>;
}

export function GET(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const d = await caseService.getCase(serviceContext(), actor, await idParam(params, 'caseId'));
    return { case: toCaseDto(d.case), lots: d.lots.map(toLotDto), locked: d.locked };
  });
}

export function PUT(request: Request, { params }: Ctx): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const caseId = await idParam(params, 'caseId');
    const input = await jsonBody(request, caseInputSchema);
    return toCaseDto(await caseService.updateCase(serviceContext(), actor, caseId, input));
  });
}
