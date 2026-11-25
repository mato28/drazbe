import { registrationService } from '@domik/core';
import { registrationRejectSchema } from '@domik/shared';
import { toRegistrationDto } from '@/server/dto';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { serviceContext } from '@/server/services';

export function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'registrationId');
    const { reason } = await jsonBody(request, registrationRejectSchema);
    const ctx = serviceContext();
    const row = await registrationService.rejectRegistration(ctx, actor, id, reason);
    return toRegistrationDto(
      row,
      (await registrationService.getRegistrationReview(ctx, actor, id)).bidder.status,
    );
  });
}
