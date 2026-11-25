import type { AuctionRow, AuditLogRow, InsolvencyCaseRow, LotRow } from '@domik/db';
import { type AuctionInput } from '@domik/shared';
import { auditSnapshot } from '../audit';
import { type Actor, type ServiceContext } from '../context';
import { DomainError, hasErrors, validationError } from '../errors';
import { settleAuction } from '../post-auction/settlement';
import { requireOwnAuction, requireOwnLot, requireTrustee } from '../trustee/access';
import {
  type AuctionConfig,
  defaultDepositCents,
  defaultRegistrationDeadline,
  normalizeAuctionConfig,
  validateAuctionConfig,
} from './config';
import { type AuctionAction, canPerform, OPEN_STATUSES, statusAfter } from './state';

// LEGAL-REVIEW: scope of "agricultural" (ZKZ) — see docs/legal-review.md
export const AGRICULTURAL_NOT_SUPPORTED =
  'Prodaja kmetijskih zemljišč v tej različici platforme ni podprta, zato dražbe ni mogoče objaviti.';

export function configOf(row: AuctionRow): AuctionConfig {
  return {
    type: row.type,
    startingPriceCents: row.startingPriceCents,
    bidIncrementCents: row.bidIncrementCents,
    priceDecrementCents: row.priceDecrementCents,
    floorPriceCents: row.floorPriceCents,
    stepDurationSec: row.stepDurationSec,
    switchToAscendingOnAccept: row.switchToAscendingOnAccept,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    extensionWindowSec: row.extensionWindowSec,
    extensionSec: row.extensionSec,
    registrationDeadline: row.registrationDeadline,
    depositCents: row.depositCents,
    preemptionEnabled: row.preemptionEnabled,
    preemptionWindowSec: row.preemptionWindowSec,
    courtApprovalRef: row.courtApprovalRef,
  };
}

/** Fills the parameters the trustee left empty with the defaults from CLAUDE.md. */
export function withDefaults(input: AuctionInput): AuctionConfig {
  return {
    ...input,
    registrationDeadline: input.registrationDeadline ?? defaultRegistrationDeadline(input.startsAt),
    depositCents: input.depositCents ?? defaultDepositCents(input.startingPriceCents),
  };
}

function validated(input: AuctionInput, now: Date): AuctionConfig {
  const config = normalizeAuctionConfig(withDefaults(input));
  const errors = validateAuctionConfig(config, now);
  if (hasErrors(errors)) throw validationError(errors);
  return config;
}

const ACTION_NOT_ALLOWED: Record<AuctionAction, string> = {
  publish: 'Objaviti je mogoče samo dražbo v stanju osnutka.',
  cancel: 'Dražbe v tem stanju ni več mogoče preklicati. Dražbo, ki poteka, lahko ustavite.',
  stop: 'Ustaviti je mogoče samo dražbo, ki poteka.',
};

export interface AuctionDetails {
  auction: AuctionRow;
  lot: LotRow;
  case: InsolvencyCaseRow;
  history: AuditLogRow[];
}

export async function listAuctions(ctx: ServiceContext, actor: Actor) {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  return ctx.uow.repos.auctions.listByTrustee(trustee.id);
}

export async function getAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<AuctionDetails> {
  const { repos } = ctx.uow;
  const trustee = await requireTrustee(repos, actor);
  const { lot: lotWithCase, ...auction } = await requireOwnAuction(repos, trustee, auctionId);
  const { case: insolvencyCase, ...lot } = lotWithCase;
  const history = await repos.auditLog.listForEntity('auction', auctionId);
  return { auction, lot, case: insolvencyCase, history };
}

export async function createAuction(
  ctx: ServiceContext,
  actor: Actor,
  lotId: string,
  input: AuctionInput,
): Promise<AuctionRow> {
  const { repos } = ctx.uow;
  const trustee = await requireTrustee(repos, actor);
  await requireOwnLot(repos, trustee, lotId);

  const existing = await repos.auctions.listByLot(lotId);
  if (existing.some((a) => a.status === 'ENDED')) {
    throw new DomainError('CONFLICT', 'Predmet prodaje je bil že prodan na dražbi.');
  }
  if (existing.some((a) => OPEN_STATUSES.includes(a.status))) {
    throw new DomainError(
      'CONFLICT',
      'Za ta predmet prodaje že obstaja odprta dražba. Najprej jo zaključite ali prekličite.',
    );
  }
  const config = validated(input, ctx.clock.now());

  return ctx.uow.transaction(async (tx) => {
    const row = await tx.auctions.create({ lotId, status: 'DRAFT', ...config });
    await tx.auditLog.append({
      actorId: actor.userId,
      entity: 'auction',
      entityId: row.id,
      action: 'auction.created',
      after: auditSnapshot(row),
      at: ctx.clock.now(),
    });
    return row;
  });
}

export async function updateAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  input: AuctionInput,
): Promise<AuctionRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  await requireOwnAuction(ctx.uow.repos, trustee, auctionId);
  const config = validated(input, ctx.clock.now());

  return ctx.uow.transaction(async (tx) => {
    const before = await tx.auctions.lockById(auctionId);
    if (before?.status !== 'DRAFT') {
      throw new DomainError('CONFLICT', 'Spreminjati je mogoče samo dražbo v stanju osnutka.');
    }
    const row = await tx.auctions.update(auctionId, config);
    if (!row) throw new DomainError('NOT_FOUND', 'Dražba ne obstaja.');
    await tx.auditLog.append({
      actorId: actor.userId,
      entity: 'auction',
      entityId: row.id,
      action: 'auction.updated',
      before: auditSnapshot(before),
      after: auditSnapshot(row),
      at: ctx.clock.now(),
    });
    return row;
  });
}

export async function publishAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<AuctionRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const { lot } = await requireOwnAuction(ctx.uow.repos, trustee, auctionId);

  if (!trustee.verifiedAt) {
    throw new DomainError(
      'FORBIDDEN',
      'Dražbe lahko objavi samo upravitelj, katerega licenco je potrdil administrator.',
    );
  }
  if (lot.isAgricultural) {
    throw new DomainError('CONFLICT', AGRICULTURAL_NOT_SUPPORTED);
  }

  return ctx.uow.transaction(async (tx) => {
    const before = await tx.auctions.lockById(auctionId);
    if (!before || !canPerform('publish', before.status)) {
      throw new DomainError('CONFLICT', ACTION_NOT_ALLOWED.publish);
    }

    // Re-validate against the current time: a draft may have gone stale.
    const now = ctx.clock.now();
    const errors = validateAuctionConfig(configOf(before), now);
    // LEGAL-REVIEW: is the court's consent to the sale always required before publishing?
    if (!before.courtApprovalRef) {
      errors.courtApprovalRef =
        'Pred objavo vnesite opravilno številko sklepa o soglasju sodišča k prodaji.';
    }
    if (hasErrors(errors)) {
      throw new DomainError(
        'VALIDATION',
        'Dražbe ni mogoče objaviti. Popravite označene podatke.',
        errors,
      );
    }

    const row = await tx.auctions.update(auctionId, {
      status: statusAfter('publish'),
      publishedAt: now,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Dražba ne obstaja.');
    await tx.auditLog.append({
      actorId: actor.userId,
      entity: 'auction',
      entityId: row.id,
      action: 'auction.published',
      before: { status: before.status },
      after: { status: row.status, publishedAt: now.toISOString() },
      at: now,
    });
    return row;
  });
}

async function close(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  action: 'cancel' | 'stop',
  reason: string,
): Promise<AuctionRow> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  await requireOwnAuction(ctx.uow.repos, trustee, auctionId);

  return ctx.uow.transaction(async (tx) => {
    const before = await tx.auctions.lockById(auctionId);
    if (!before || !canPerform(action, before.status)) {
      throw new DomainError('CONFLICT', ACTION_NOT_ALLOWED[action]);
    }
    const now = ctx.clock.now();
    const row = await tx.auctions.update(auctionId, {
      status: statusAfter(action),
      closedReason: reason,
      closedAt: now,
    });
    if (!row) throw new DomainError('NOT_FOUND', 'Dražba ne obstaja.');
    await tx.auditLog.append({
      actorId: actor.userId,
      entity: 'auction',
      entityId: row.id,
      action: action === 'cancel' ? 'auction.cancelled' : 'auction.stopped',
      before: { status: before.status },
      after: { status: row.status, reason, closedAt: now.toISOString() },
      at: now,
    });
    // Paid deposits become refundable; registered bidders are told. A draft that was never
    // published has no bidders, no deposits and no report.
    const settled =
      row.publishedAt === null ? row : await settleAuction(tx, row, now, ctx.appUrl);
    // Live viewers (SSE) see the stop immediately; the worker clock ignores closed auctions.
    await tx.auctionEvents.publish({ auctionId, type: 'status' });
    return settled;
  });
}

/** Call off an auction before it goes live. */
export function cancelAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  reason: string,
) {
  return close(ctx, actor, auctionId, 'cancel', reason);
}

/** Stop an auction that is running. */
export function stopAuction(ctx: ServiceContext, actor: Actor, auctionId: string, reason: string) {
  return close(ctx, actor, auctionId, 'stop', reason);
}
