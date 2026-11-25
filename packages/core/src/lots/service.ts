import type { AuctionRow, DocumentRow, InsolvencyCaseRow, LotRow, Repositories } from '@domik/db';
import { type LotInput } from '@domik/shared';
import { auditSnapshot } from '../audit';
import { LOCKING_STATUSES } from '../auctions/state';
import { type Actor, type ServiceContext } from '../context';
import { DomainError } from '../errors';
import { requireOwnCase, requireOwnLot, requireTrustee } from '../trustee/access';

export const LOT_LOCKED_MESSAGE =
  'Predmeta prodaje ni mogoče spreminjati, ker je zanj objavljena dražba.';

/** A lot is frozen once an auction for it has been published (the published notice must stay true). */
export async function isLotLocked(repos: Repositories, lotId: string): Promise<boolean> {
  const auctions = await repos.auctions.listByLot(lotId);
  return auctions.some((a) => LOCKING_STATUSES.includes(a.status));
}

export async function assertLotEditable(repos: Repositories, lotId: string): Promise<void> {
  if (await isLotLocked(repos, lotId)) throw new DomainError('CONFLICT', LOT_LOCKED_MESSAGE);
}

export interface LotDetails {
  lot: LotRow;
  case: InsolvencyCaseRow;
  documents: DocumentRow[];
  auctions: AuctionRow[];
  locked: boolean;
}

export async function getLot(
  ctx: ServiceContext,
  actor: Actor,
  lotId: string,
): Promise<LotDetails> {
  const { repos } = ctx.uow;
  const trustee = await requireTrustee(repos, actor);
  const { case: insolvencyCase, ...lot } = await requireOwnLot(repos, trustee, lotId);
  const [documents, auctions] = await Promise.all([
    repos.documents.listByOwner('LOT', lotId),
    repos.auctions.listByLot(lotId),
  ]);
  return {
    lot,
    case: insolvencyCase,
    documents,
    auctions,
    locked: auctions.some((a) => LOCKING_STATUSES.includes(a.status)),
  };
}

export async function createLot(
  ctx: ServiceContext,
  actor: Actor,
  caseId: string,
  input: LotInput,
): Promise<LotRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  await requireOwnCase(ctx.uow.repos, trustee, caseId);

  return ctx.uow.transaction(async (repos) => {
    const row = await repos.lots.create({ caseId, type: 'REAL_ESTATE', ...input });
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'lot',
      entityId: row.id,
      action: 'lot.created',
      after: auditSnapshot(row),
      at: ctx.clock.now(),
    });
    return row;
  });
}

export async function updateLot(
  ctx: ServiceContext,
  actor: Actor,
  lotId: string,
  input: LotInput,
): Promise<LotRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const { case: _case, ...before } = await requireOwnLot(ctx.uow.repos, trustee, lotId);
  await assertLotEditable(ctx.uow.repos, lotId);

  return ctx.uow.transaction(async (repos) => {
    const row = await repos.lots.update(lotId, input);
    if (!row) throw new DomainError('NOT_FOUND', 'Predmet prodaje ne obstaja.');
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'lot',
      entityId: row.id,
      action: 'lot.updated',
      before: auditSnapshot(before),
      after: auditSnapshot(row),
      at: ctx.clock.now(),
    });
    return row;
  });
}
