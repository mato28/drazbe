import { bidderService } from '@domik/core';
import { bidderProfileInputSchema } from '@domik/shared';
import { BIDDER, handle, jsonBody } from '@/server/api';
import { toBidderProfileDto, toDocumentDto } from '@/server/dto';
import { serviceContext } from '@/server/services';

export function GET(request: Request): Promise<Response> {
  return handle(request, BIDDER, async (actor) => {
    const o = await bidderService.getOnboarding(serviceContext(), actor);
    return {
      profile: o.profile ? toBidderProfileDto(o.profile, o.phone) : null,
      documents: o.documents.map(toDocumentDto),
      missing: o.missing,
    };
  });
}

export function PUT(request: Request): Promise<Response> {
  return handle(request, BIDDER, async (actor) => {
    const input = await jsonBody(request, bidderProfileInputSchema);
    const ctx = serviceContext();
    const profile = await bidderService.saveProfile(ctx, actor, input);
    const { phone } = await bidderService.getOnboarding(ctx, actor);
    return toBidderProfileDto(profile, phone);
  });
}
