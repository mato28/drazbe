import { registrationService } from '@domik/core';
import { depositUpdateSchema } from '@domik/shared';
import { toRegistrationDto } from '@/server/dto';
import { handle, idParam, jsonBody, TRUSTEE } from '@/server/api';
import { serviceContext } from '@/server/services';

export function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'registrationId');
    const update = await jsonBody(request, depositUpdateSchema);
    const ctx = serviceContext();
    const row = await registrationService.setDeposit(ctx, actor, id, update);
    return toRegistrationDto(
      row,
      (await registrationService.getRegistrationReview(ctx, actor, id)).bidder.status,
    );
  });
}
