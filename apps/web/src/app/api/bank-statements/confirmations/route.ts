import { registrationService } from '@domik/core';
import { confirmDepositMatchesSchema } from '@domik/shared';
import { handle, jsonBody, TRUSTEE } from '@/server/api';
import { serviceContext } from '@/server/services';

/** Marks the deposits the trustee confirmed as paid. Every line is re-validated in core. */
export function POST(request: Request): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const input = await jsonBody(request, confirmDepositMatchesSchema);
    return registrationService.confirmDepositMatches(serviceContext(), actor, input);
  });
}
