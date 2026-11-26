import { type VatLookupDto } from '@domik/shared';
import { type Actor, type ServiceContext } from '../context';
import { DomainError, validationError } from '../errors';
import { isValidSlovenianTaxId, normalizeTaxId } from '../validation/tax-id';

/**
 * Looks up a Slovenian tax number in the VAT register to pre-fill name and address.
 * Purely a convenience: the result is never stored or trusted for verification.
 */
export async function lookupTaxId(
  ctx: ServiceContext,
  actor: Actor,
  rawTaxId: string,
): Promise<VatLookupDto> {
  if (actor.role !== 'TRUSTEE' && actor.role !== 'BIDDER') {
    throw new DomainError('FORBIDDEN', 'Za to dejanje nimate pravic.');
  }
  const taxId = normalizeTaxId(rawTaxId);
  if (!isValidSlovenianTaxId(taxId)) {
    throw validationError({
      taxId: 'Davčna številka ni veljavna (8 številk s kontrolno številko).',
    });
  }
  const result = await ctx.vat.lookup(taxId);
  return result.status === 'FOUND'
    ? { status: 'FOUND', taxId, ...result.record }
    : { status: result.status, taxId };
}
