import { registrationService } from '@domik/core';
import { toRegistrationDto } from '@/server/dto';
import { handle, idParam, TRUSTEE } from '@/server/api';
import { serviceContext } from '@/server/services';

export function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
): Promise<Response> {
  return handle(request, TRUSTEE, async (actor) => {
    const id = await idParam(params, 'registrationId');
    const row = await registrationService.approveRegistration(serviceContext(), actor, id);
    return toRegistrationDto(row, 'VERIFIED');
  });
}
