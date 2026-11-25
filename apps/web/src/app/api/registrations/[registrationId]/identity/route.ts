import { registrationService } from '@domik/core';
import { identityDecisionSchema } from '@domik/shared';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { serviceContext } from '@/server/services';

export function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'registrationId');
    const decision = await jsonBody(request, identityDecisionSchema);
    const profile = await registrationService.decideIdentity(serviceContext(), actor, id, decision);
    return { identityStatus: profile.status };
  });
}
