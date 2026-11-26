import { vatService } from '@domik/core';
import { vatLookupQuerySchema } from '@domik/shared';
import { handle, parse, TRUSTEE_OR_BIDDER } from '@/server/api';
import { enforceRateLimit } from '@/server/rate-limit';
import { serviceContext } from '@/server/services';

/** Pre-fill helper: company name and address for a Slovenian tax number, from EU VIES. */
export function GET(request: Request): Promise<Response> {
  return handle(request, TRUSTEE_OR_BIDDER, async (actor) => {
    enforceRateLimit('vatLookup', `user:${actor.userId}`);
    const query = parse(
      vatLookupQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return vatService.lookupTaxId(serviceContext(), actor, query.taxId);
  });
}
