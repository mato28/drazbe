import type { Repositories, TrusteeRow } from '@domik/db';
import { type Actor } from '../context';
import { DomainError, notFound } from '../errors';

/** The trustee profile of the acting user. Throws FORBIDDEN for anyone who is not a trustee. */
export async function requireTrustee(repos: Repositories, actor: Actor): Promise<TrusteeRow> {
  if (actor.role !== 'TRUSTEE') {
    throw new DomainError('FORBIDDEN', 'To dejanje lahko izvede samo stečajni upravitelj.');
  }
  const trustee = await repos.trustees.findByUserId(actor.userId);
  if (!trustee) {
    throw new DomainError(
      'FORBIDDEN',
      'Vaš uporabniški račun ni povezan s profilom stečajnega upravitelja.',
    );
  }
  return trustee;
}

// Resources of other trustees are reported as "not found" so their existence is not revealed.

export async function requireOwnCase(repos: Repositories, trustee: TrusteeRow, caseId: string) {
  const row = await repos.insolvencyCases.findById(caseId);
  if (row?.trusteeId !== trustee.id) throw notFound('Stečajni postopek');
  return row;
}

export async function requireOwnLot(repos: Repositories, trustee: TrusteeRow, lotId: string) {
  const row = await repos.lots.findWithCase(lotId);
  if (row?.case.trusteeId !== trustee.id) throw notFound('Predmet prodaje');
  return row;
}

export async function requireOwnAuction(
  repos: Repositories,
  trustee: TrusteeRow,
  auctionId: string,
) {
  const row = await repos.auctions.findWithLotAndCase(auctionId);
  if (row?.lot.case.trusteeId !== trustee.id) throw notFound('Dražba');
  return row;
}
