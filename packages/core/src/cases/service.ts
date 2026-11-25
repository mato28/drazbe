import type { InsolvencyCaseRow, LotRow } from '@domik/db';
import { type CaseInput } from '@domik/shared';
import { auditSnapshot } from '../audit';
import { LOCKING_STATUSES } from '../auctions/state';
import { type Actor, type ServiceContext } from '../context';
import { DomainError, type FieldErrors, hasErrors, validationError } from '../errors';
import { requireOwnCase, requireTrustee } from '../trustee/access';
import { isValidIban, normalizeIban } from '../validation/iban';
import { isValidSlovenianTaxId, normalizeTaxId } from '../validation/tax-id';

/** Business validation of case data (shape is validated by the zod schema). */
export function validateCaseInput(input: CaseInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!isValidIban(normalizeIban(input.estateIban))) {
    errors.estateIban =
      'IBAN ni veljaven. Preverite številko računa (npr. SI56 0510 0801 2340 041).';
  }
  if (!isValidSlovenianTaxId(normalizeTaxId(input.debtorTaxId))) {
    errors.debtorTaxId = 'Davčna številka ni veljavna (8 številk s kontrolno številko).';
  }
  return errors;
}

function toRowValues(input: CaseInput) {
  return {
    court: input.court,
    caseNumber: input.caseNumber,
    debtorName: input.debtorName,
    debtorTaxId: normalizeTaxId(input.debtorTaxId),
    debtorAddress: input.debtorAddress,
    debtorCity: input.debtorCity,
    estateIban: normalizeIban(input.estateIban),
    estateBank: input.estateBank,
  };
}

const DUPLICATE = new DomainError(
  'CONFLICT',
  'Postopek s to opravilno številko pri tem sodišču že obstaja.',
  { caseNumber: 'Postopek s to opravilno številko pri tem sodišču že obstaja.' },
);

/** Postgres unique violation on (court, case_number)? */
function isDuplicateCase(e: unknown): boolean {
  const text = `${(e as Error).message} ${(e as { cause?: Error }).cause?.message ?? ''}`;
  return text.includes('insolvency_cases_court_case_number_unique');
}

export async function listCases(ctx: ServiceContext, actor: Actor): Promise<InsolvencyCaseRow[]> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  return ctx.uow.repos.insolvencyCases.listByTrustee(trustee.id);
}

export async function getCase(
  ctx: ServiceContext,
  actor: Actor,
  caseId: string,
): Promise<{ case: InsolvencyCaseRow; lots: LotRow[]; locked: boolean }> {
  const { repos } = ctx.uow;
  const trustee = await requireTrustee(repos, actor);
  const row = await requireOwnCase(repos, trustee, caseId);
  const lots = await repos.lots.listByCase(caseId);
  return { case: row, lots, locked: await isCaseLocked(ctx, trustee.id, caseId) };
}

async function isCaseLocked(ctx: ServiceContext, trusteeId: string, caseId: string) {
  const auctions = await ctx.uow.repos.auctions.listByTrustee(trusteeId);
  return auctions.some((a) => a.caseId === caseId && LOCKING_STATUSES.includes(a.status));
}

export async function createCase(
  ctx: ServiceContext,
  actor: Actor,
  input: CaseInput,
): Promise<InsolvencyCaseRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const errors = validateCaseInput(input);
  if (hasErrors(errors)) throw validationError(errors);

  try {
    return await ctx.uow.transaction(async (repos) => {
      const row = await repos.insolvencyCases.create({
        trusteeId: trustee.id,
        ...toRowValues(input),
      });
      await repos.auditLog.append({
        actorId: actor.userId,
        entity: 'insolvency_case',
        entityId: row.id,
        action: 'case.created',
        after: auditSnapshot(row),
        at: ctx.clock.now(),
      });
      return row;
    });
  } catch (e) {
    if (isDuplicateCase(e)) throw DUPLICATE;
    throw e;
  }
}

export async function updateCase(
  ctx: ServiceContext,
  actor: Actor,
  caseId: string,
  input: CaseInput,
): Promise<InsolvencyCaseRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const before = await requireOwnCase(ctx.uow.repos, trustee, caseId);
  if (await isCaseLocked(ctx, trustee.id, caseId)) {
    // The estate IBAN is where deposits are paid: it must not change under a published auction.
    throw new DomainError(
      'CONFLICT',
      'Podatkov postopka ni mogoče spreminjati, ker je v njem objavljena dražba.',
    );
  }
  const errors = validateCaseInput(input);
  if (hasErrors(errors)) throw validationError(errors);

  try {
    return await ctx.uow.transaction(async (repos) => {
      const row = await repos.insolvencyCases.update(caseId, toRowValues(input));
      if (!row) throw new DomainError('NOT_FOUND', 'Stečajni postopek ne obstaja.');
      await repos.auditLog.append({
        actorId: actor.userId,
        entity: 'insolvency_case',
        entityId: row.id,
        action: 'case.updated',
        before: auditSnapshot(before),
        after: auditSnapshot(row),
        at: ctx.clock.now(),
      });
      return row;
    });
  } catch (e) {
    if (isDuplicateCase(e)) throw DUPLICATE;
    throw e;
  }
}
