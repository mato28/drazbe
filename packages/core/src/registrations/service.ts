import type {
  AuctionRegistrationRow,
  AuctionRow,
  BidderProfileRow,
  DocumentRow,
  Repositories,
} from '@domik/db';
import {
  type ConfirmDepositMatches,
  type DepositUpdate,
  formatCents,
  formatDateTime,
  type IdentityDecision,
  type PreemptionUpdate,
} from '@domik/shared';
import { auditSnapshot } from '../audit';
import { configOf } from '../auctions/service';
import { missingOnboardingSteps } from '../bidders/service';
import { type Actor, type ServiceContext } from '../context';
import { removeDocument, storeDocument } from '../documents/service';
import { DomainError, notFound, validationError } from '../errors';
import { type BankTransaction, parseBankStatement } from '../payments/bank-statement';
import { type DepositMatch, matchDeposits, type MatchConfidence } from '../payments/matching';
import { buildDepositReference } from '../payments/sklic';
import { buildUpnQrPayload, type UpnPayment } from '../payments/upn-qr';
import { auctionRulesSummary } from '../public/rules';
import { requireOwnAuction, requireTrustee } from '../trustee/access';
import { buildStatementContent, type DocumentContent } from './statement';

type Detailed = NonNullable<
  Awaited<ReturnType<Repositories['auctionRegistrations']['findDetailed']>>
>;

const registrationUrl = (ctx: ServiceContext, auctionId: string): string =>
  `${ctx.appUrl}/drazitelj/drazbe/${auctionId}`;

export const pseudonymFor = (seq: number): string => `Dražitelj ${seq}`;

// ---------------------------------------------------------------------------
// Bidder side
// ---------------------------------------------------------------------------

async function requireBidderProfile(repos: Repositories, actor: Actor): Promise<BidderProfileRow> {
  if (actor.role !== 'BIDDER') {
    throw new DomainError('FORBIDDEN', 'Na dražbo se lahko prijavi samo dražitelj.');
  }
  const profile = await repos.bidderProfiles.findByUserId(actor.userId);
  if (!profile) {
    throw new DomainError('CONFLICT', 'Pred prijavo na dražbo izpolnite podatke dražitelja.');
  }
  return profile;
}

/** Registration is open while the auction is published and the deadline has not passed. */
function assertRegistrationOpen(auction: AuctionRow, now: Date): void {
  if (auction.status !== 'PUBLISHED' || auction.publishedAt === null) {
    throw new DomainError('CONFLICT', 'Prijava na to dražbo ni mogoča.');
  }
  if (now.getTime() >= auction.registrationDeadline.getTime()) {
    throw new DomainError(
      'CONFLICT',
      `Rok za prijavo na dražbo je potekel (${formatDateTime(auction.registrationDeadline)}).`,
    );
  }
}

/** Registers the signed-in bidder for an auction: assigns the pseudonym and the deposit sklic. */
export async function registerForAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<AuctionRegistrationRow> {
  const profile = await requireBidderProfile(ctx.uow.repos, actor);
  if (profile.status === 'REJECTED') {
    throw new DomainError(
      'CONFLICT',
      'Vaša identiteta je bila zavrnjena. Popravite podatke dražitelja in jih znova oddajte.',
    );
  }
  const docs = await ctx.uow.repos.documents.listByOwner('BIDDER_PROFILE', profile.id);
  const missing = missingOnboardingSteps(profile, docs);
  if (missing.length > 0) {
    throw new DomainError('CONFLICT', `Pred prijavo na dražbo: ${missing.join(' ')}`);
  }
  const user = await ctx.uow.repos.users.findById(actor.userId);

  return ctx.uow.transaction(async (repos) => {
    // The lock serializes registrations of one auction, so numbering has no gaps or duplicates.
    const auction = await repos.auctions.lockById(auctionId);
    if (!auction || auction.status === 'DRAFT') throw notFound('Dražba');
    const now = ctx.clock.now();
    assertRegistrationOpen(auction, now);

    if (await repos.auctionRegistrations.findByAuctionAndBidder(auctionId, profile.id)) {
      throw new DomainError('CONFLICT', 'Na to dražbo ste že prijavljeni.');
    }
    const lot = await repos.lots.findById(auction.lotId);

    const seq = await repos.auctionRegistrations.nextSeq(auctionId);
    const row = await repos.auctionRegistrations.create({
      auctionId,
      bidderId: profile.id,
      seq,
      pseudonym: pseudonymFor(seq),
      paymentReference: buildDepositReference(auction.number, seq),
    });
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'auction_registration',
      entityId: row.id,
      action: 'registration.created',
      after: auditSnapshot(row),
      at: now,
    });
    if (user) {
      await repos.notificationsOutbox.enqueue({
        template: 'registration.received',
        recipient: user.email,
        payload: {
          lotTitle: lot?.title ?? '',
          pseudonym: row.pseudonym,
          registrationDeadline: formatDateTime(auction.registrationDeadline),
          depositAmount: formatCents(auction.depositCents),
          paymentReference: row.paymentReference,
          url: registrationUrl(ctx, auctionId),
        },
        dedupeKey: `registration.received:${row.id}`,
      });
    }
    return row;
  });
}

export interface DepositPayment {
  amountCents: bigint;
  payeeName: string;
  payeeAddress: string;
  payeeCity: string;
  payeeIban: string;
  reference: string;
  purpose: string;
  dueDate: Date;
  /** Content of the UPN QR code. */
  upnQrPayload: string;
}

/** Everything needed to pay the deposit — always to the debtor's estate account, never to us. */
export function depositPaymentFor(
  d: Pick<Detailed, 'registration' | 'auction' | 'case'>,
): DepositPayment {
  const payment: UpnPayment = {
    amountCents: d.auction.depositCents,
    purposeCode: 'OTHR',
    purpose: `Varščina, dražba št. ${d.auction.number}, ${d.case.caseNumber}`,
    dueDate: d.auction.registrationDeadline,
    payeeIban: d.case.estateIban,
    payeeReference: d.registration.paymentReference,
    payeeName: d.case.debtorName,
    payeeAddress: d.case.debtorAddress ?? '',
    payeeCity: d.case.debtorCity ?? '',
  };
  return {
    amountCents: payment.amountCents,
    payeeName: payment.payeeName,
    payeeAddress: payment.payeeAddress,
    payeeCity: payment.payeeCity,
    payeeIban: payment.payeeIban,
    reference: payment.payeeReference,
    purpose: payment.purpose,
    dueDate: d.auction.registrationDeadline,
    upnQrPayload: buildUpnQrPayload(payment),
  };
}

async function requireOwnRegistration(ctx: ServiceContext, actor: Actor, registrationId: string) {
  const profile = await requireBidderProfile(ctx.uow.repos, actor);
  const detailed = await ctx.uow.repos.auctionRegistrations.findDetailed(registrationId);
  if (detailed?.bidder.id !== profile.id) throw notFound('Prijava');
  return detailed;
}

export interface MyRegistration {
  registration: AuctionRegistrationRow;
  auction: AuctionRow;
  lotTitle: string;
  identityStatus: BidderProfileRow['status'];
  payment: DepositPayment;
  statement: DocumentRow | null;
  /** Can the signed statement still be uploaded / replaced? */
  canUploadStatement: boolean;
}

function toMyRegistration(d: Detailed, statement: DocumentRow | null, now: Date): MyRegistration {
  return {
    registration: d.registration,
    auction: d.auction,
    lotTitle: d.lot.title,
    identityStatus: d.bidder.status,
    payment: depositPaymentFor(d),
    statement,
    canUploadStatement:
      d.registration.status === 'PENDING' &&
      d.auction.status === 'PUBLISHED' &&
      now.getTime() < d.auction.registrationDeadline.getTime(),
  };
}

/** The signed-in bidder's registration for an auction, or null if not registered. */
export async function getMyRegistrationForAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<MyRegistration | null> {
  const { repos } = ctx.uow;
  const profile = await repos.bidderProfiles.findByUserId(actor.userId);
  if (actor.role !== 'BIDDER' || !profile) return null;
  const reg = await repos.auctionRegistrations.findByAuctionAndBidder(auctionId, profile.id);
  if (!reg) return null;
  const d = await repos.auctionRegistrations.findDetailed(reg.id);
  if (!d) return null;
  const statement = reg.statementSignedDocId
    ? await repos.documents.findById(reg.statementSignedDocId)
    : undefined;
  return toMyRegistration(d, statement ?? null, ctx.clock.now());
}

export async function listMyRegistrations(ctx: ServiceContext, actor: Actor) {
  const { repos } = ctx.uow;
  const profile = await repos.bidderProfiles.findByUserId(actor.userId);
  if (actor.role !== 'BIDDER' || !profile) return [];
  return repos.auctionRegistrations.listByBidder(profile.id);
}

/** Content of the pre-filled statement the bidder downloads, signs and uploads. */
export async function getStatementContent(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
): Promise<{ content: DocumentContent; filename: string }> {
  const d = await requireOwnRegistration(ctx, actor, registrationId);
  return {
    content: buildStatementContent({
      bidder: d.bidder,
      auction: d.auction,
      lot: d.lot,
      case: d.case,
      registration: d.registration,
      rules: auctionRulesSummary(configOf(d.auction)),
    }),
    filename: `izjava-drazba-${d.auction.number}.pdf`,
  };
}

/** Deposit payment data + UPN QR content for the bidder's own registration. */
export async function getMyDepositPayment(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
): Promise<DepositPayment> {
  return depositPaymentFor(await requireOwnRegistration(ctx, actor, registrationId));
}

// LEGAL-REVIEW: accepted form of the signed statement — see docs/legal-review.md
/** Uploads (or replaces) the signed statement. Only until the registration deadline. */
export async function uploadSignedStatement(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
  file: { filename: string; bytes: Uint8Array },
): Promise<DocumentRow> {
  const d = await requireOwnRegistration(ctx, actor, registrationId);
  if (d.registration.status !== 'PENDING') {
    throw new DomainError(
      'CONFLICT',
      'Prijava je že obravnavana, zato izjave ni več mogoče zamenjati.',
    );
  }
  assertRegistrationOpen(d.auction, ctx.clock.now());

  const previousId = d.registration.statementSignedDocId;
  const previous = previousId ? await ctx.uow.repos.documents.findById(previousId) : undefined;

  const doc = await storeDocument(
    ctx,
    actor,
    {
      ownerType: 'AUCTION_REGISTRATION',
      ownerId: d.registration.id,
      kind: 'EXCLUSION_STATEMENT',
      filename: file.filename,
      bytes: file.bytes,
      keyPrefix: `registrations/${d.registration.id}`,
    },
    async (repos, row) => {
      await repos.auctionRegistrations.update(d.registration.id, { statementSignedDocId: row.id });
    },
  );
  if (previous) await removeDocument(ctx, actor, previous);
  return doc;
}

// ---------------------------------------------------------------------------
// Trustee side
// ---------------------------------------------------------------------------

/** Registration in one of the trustee's own auctions, or "not found". */
async function requireReviewable(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
): Promise<Detailed> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const d = await ctx.uow.repos.auctionRegistrations.findDetailed(registrationId);
  if (d?.case.trusteeId !== trustee.id) throw notFound('Prijava');
  return d;
}

export async function listAuctionRegistrations(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
) {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  await requireOwnAuction(ctx.uow.repos, trustee, auctionId);
  return ctx.uow.repos.auctionRegistrations.listByAuctionWithBidder(auctionId);
}

export interface RegistrationReview extends Detailed {
  bidderDocuments: DocumentRow[];
  statement: DocumentRow | null;
  /** What still prevents approval; empty = can be approved. */
  blockers: string[];
  /** Does the identity provider need the trustee to decide? */
  identityNeedsReview: boolean;
}

function approvalBlockers(d: Detailed): string[] {
  const blockers: string[] = [];
  if (d.bidder.status !== 'VERIFIED') blockers.push('Identiteta dražitelja še ni potrjena.');
  if (!d.registration.statementSignedDocId)
    blockers.push('Dražitelj še ni naložil podpisane izjave.');
  if (d.registration.depositStatus !== 'PAID')
    blockers.push('Varščina še ni označena kot plačana.');
  return blockers;
}

export async function getRegistrationReview(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
): Promise<RegistrationReview> {
  const d = await requireReviewable(ctx, actor, registrationId);
  const { repos } = ctx.uow;
  const [bidderDocuments, statement] = await Promise.all([
    repos.documents.listByOwner('BIDDER_PROFILE', d.bidder.id),
    d.registration.statementSignedDocId
      ? repos.documents.findById(d.registration.statementSignedDocId)
      : undefined,
  ]);
  return {
    ...d,
    bidderDocuments,
    statement: statement ?? null,
    blockers: approvalBlockers(d),
    identityNeedsReview: ctx.identity.requiresHumanReview,
  };
}

const BEFORE_LIVE: readonly AuctionRow['status'][] = ['PUBLISHED', 'REGISTRATION_CLOSED'];

function assertBeforeLive(auction: AuctionRow): void {
  if (!BEFORE_LIVE.includes(auction.status)) {
    throw new DomainError(
      'CONFLICT',
      'Prijav ni več mogoče spreminjati, ker dražba ni več v fazi prijav.',
    );
  }
}

// LEGAL-REVIEW: adequacy and reuse of manual identity verification — see docs/legal-review.md
/** Manual identity decision by the trustee (ManualIdentityProvider). */
export async function decideIdentity(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
  decision: IdentityDecision,
): Promise<BidderProfileRow> {
  const d = await requireReviewable(ctx, actor, registrationId);
  if (!ctx.identity.requiresHumanReview) {
    throw new DomainError(
      'CONFLICT',
      'Identiteto preverja zunanji ponudnik in je ni mogoče potrditi ročno.',
    );
  }
  const docs = await ctx.uow.repos.documents.listByOwner('BIDDER_PROFILE', d.bidder.id);
  if (decision.decision === 'VERIFIED' && missingOnboardingSteps(d.bidder, docs).length > 0) {
    throw new DomainError(
      'CONFLICT',
      'Identitete ni mogoče potrditi, ker dražitelj ni naložil vseh dokumentov.',
    );
  }
  const now = ctx.clock.now();

  return ctx.uow.transaction(async (repos) => {
    const row = await repos.bidderProfiles.update(d.bidder.id, {
      status: decision.decision,
      verifiedBy: actor.userId,
      verifiedAt: decision.decision === 'VERIFIED' ? now : null,
      rejectionReason: decision.decision === 'REJECTED' ? decision.reason : null,
    });
    if (!row) throw notFound('Profil dražitelja');
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'bidder_profile',
      entityId: row.id,
      action: decision.decision === 'VERIFIED' ? 'identity.verified' : 'identity.rejected',
      before: { status: d.bidder.status },
      after: {
        status: row.status,
        provider: ctx.identity.id,
        registrationId,
        ...(decision.decision === 'REJECTED' ? { reason: decision.reason } : {}),
      },
      at: now,
    });
    return row;
  });
}

/** Marks one deposit paid inside an open transaction (shared by manual marking and import). */
async function markDepositPaid(
  ctx: ServiceContext,
  repos: Repositories,
  actor: Actor,
  d: Detailed,
  note: string | null,
  evidence: Record<string, unknown>,
): Promise<AuctionRegistrationRow> {
  const now = ctx.clock.now();
  const row = await repos.auctionRegistrations.update(d.registration.id, {
    depositStatus: 'PAID',
    depositPaidAt: now,
    depositMarkedBy: actor.userId,
    depositNote: note,
  });
  if (!row) throw notFound('Prijava');
  await repos.auditLog.append({
    actorId: actor.userId,
    entity: 'auction_registration',
    entityId: row.id,
    action: 'deposit.marked_paid',
    before: { depositStatus: d.registration.depositStatus },
    after: {
      depositStatus: 'PAID',
      amountCents: d.auction.depositCents.toString(),
      note,
      ...evidence,
    },
    at: now,
  });
  await repos.notificationsOutbox.enqueue({
    template: 'deposit.confirmed',
    recipient: d.user.email,
    payload: {
      lotTitle: d.lot.title,
      depositAmount: formatCents(d.auction.depositCents),
      url: registrationUrl(ctx, d.auction.id),
    },
    dedupeKey: `deposit.confirmed:${row.id}:${now.toISOString()}`,
  });
  return row;
}

// LEGAL-REVIEW: deposits received after the registration deadline — see docs/legal-review.md
/** Manually mark the deposit paid, or undo that while the registration is still pending. */
export async function setDeposit(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
  update: DepositUpdate,
): Promise<AuctionRegistrationRow> {
  const d = await requireReviewable(ctx, actor, registrationId);
  assertBeforeLive(d.auction);
  const current = d.registration.depositStatus;

  if (update.status === 'PAID') {
    if (current !== 'PENDING')
      throw new DomainError('CONFLICT', 'Varščina je že označena kot plačana.');
    return ctx.uow.transaction((repos) =>
      markDepositPaid(
        ctx,
        repos,
        actor,
        d,
        update.note?.trim() ? update.note.trim() : 'Ročno potrjeno',
        {
          source: 'manual',
        },
      ),
    );
  }

  if (current !== 'PAID') throw new DomainError('CONFLICT', 'Varščina ni označena kot plačana.');
  if (d.registration.status === 'APPROVED') {
    throw new DomainError(
      'CONFLICT',
      'Prijava je že potrjena. Najprej jo zavrnite, če varščina ni bila plačana.',
    );
  }
  return ctx.uow.transaction(async (repos) => {
    const row = await repos.auctionRegistrations.update(registrationId, {
      depositStatus: 'PENDING',
      depositPaidAt: null,
      depositMarkedBy: null,
      depositNote: null,
    });
    if (!row) throw notFound('Prijava');
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'auction_registration',
      entityId: row.id,
      action: 'deposit.unmarked',
      before: { depositStatus: 'PAID', note: d.registration.depositNote },
      after: { depositStatus: 'PENDING', ...(update.note ? { note: update.note } : {}) },
      at: ctx.clock.now(),
    });
    return row;
  });
}

// LEGAL-REVIEW: ordering of multiple pre-emption holders — see docs/legal-review.md
export async function setPreemption(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
  update: PreemptionUpdate,
): Promise<AuctionRegistrationRow> {
  const d = await requireReviewable(ctx, actor, registrationId);
  assertBeforeLive(d.auction);
  if (update.isHolder && !d.auction.preemptionEnabled) {
    throw new DomainError('CONFLICT', 'Za to dražbo predkupna pravica ni predvidena.');
  }

  return ctx.uow.transaction(async (repos) => {
    await repos.auctions.lockById(d.auction.id);
    if (update.isHolder) {
      const others = await repos.auctionRegistrations.listByAuction(d.auction.id);
      if (
        others.some(
          (o) =>
            o.id !== registrationId && o.isPreemptionHolder && o.preemptionRank === update.rank,
        )
      ) {
        throw validationError({
          rank: `Vrstni red ${update.rank} že ima drug predkupni upravičenec.`,
        });
      }
    }
    const row = await repos.auctionRegistrations.update(registrationId, {
      isPreemptionHolder: update.isHolder,
      preemptionRank: update.isHolder ? update.rank : null,
    });
    if (!row) throw notFound('Prijava');
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'auction_registration',
      entityId: row.id,
      action: 'registration.preemption_set',
      before: {
        isPreemptionHolder: d.registration.isPreemptionHolder,
        preemptionRank: d.registration.preemptionRank,
      },
      after: { isPreemptionHolder: row.isPreemptionHolder, preemptionRank: row.preemptionRank },
      at: ctx.clock.now(),
    });
    return row;
  });
}

/** Approves a registration: identity verified, signed statement uploaded, deposit paid. */
export async function approveRegistration(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
): Promise<AuctionRegistrationRow> {
  const d = await requireReviewable(ctx, actor, registrationId);
  assertBeforeLive(d.auction);
  if (d.registration.status === 'APPROVED')
    throw new DomainError('CONFLICT', 'Prijava je že potrjena.');
  const blockers = approvalBlockers(d);
  if (blockers.length > 0) {
    throw new DomainError('CONFLICT', `Prijave še ni mogoče potrditi. ${blockers.join(' ')}`);
  }
  const now = ctx.clock.now();

  return ctx.uow.transaction(async (repos) => {
    const row = await repos.auctionRegistrations.update(registrationId, {
      status: 'APPROVED',
      approvedBy: actor.userId,
      approvedAt: now,
      rejectionReason: null,
    });
    if (!row) throw notFound('Prijava');
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'auction_registration',
      entityId: row.id,
      action: 'registration.approved',
      before: { status: d.registration.status },
      after: { status: 'APPROVED', pseudonym: row.pseudonym },
      at: now,
    });
    await repos.notificationsOutbox.enqueue({
      template: 'registration.approved',
      recipient: d.user.email,
      payload: {
        lotTitle: d.lot.title,
        pseudonym: row.pseudonym,
        startsAt: formatDateTime(d.auction.startsAt),
        url: registrationUrl(ctx, d.auction.id),
      },
      dedupeKey: `registration.approved:${row.id}:${now.toISOString()}`,
    });
    return row;
  });
}

export async function rejectRegistration(
  ctx: ServiceContext,
  actor: Actor,
  registrationId: string,
  reason: string,
): Promise<AuctionRegistrationRow> {
  const d = await requireReviewable(ctx, actor, registrationId);
  assertBeforeLive(d.auction);
  if (d.registration.status === 'REJECTED')
    throw new DomainError('CONFLICT', 'Prijava je že zavrnjena.');
  const now = ctx.clock.now();

  return ctx.uow.transaction(async (repos) => {
    const row = await repos.auctionRegistrations.update(registrationId, {
      status: 'REJECTED',
      approvedBy: null,
      approvedAt: null,
      rejectionReason: reason,
    });
    if (!row) throw notFound('Prijava');
    await repos.auditLog.append({
      actorId: actor.userId,
      entity: 'auction_registration',
      entityId: row.id,
      action: 'registration.rejected',
      before: { status: d.registration.status },
      after: { status: 'REJECTED', reason },
      at: now,
    });
    await repos.notificationsOutbox.enqueue({
      template: 'registration.rejected',
      recipient: d.user.email,
      payload: { lotTitle: d.lot.title, reason, url: registrationUrl(ctx, d.auction.id) },
      dedupeKey: `registration.rejected:${row.id}:${now.toISOString()}`,
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Bank statement import
// ---------------------------------------------------------------------------

export interface ProposedDepositMatch {
  registrationId: string;
  confidence: MatchConfidence;
  transaction: BankTransaction;
  pseudonym: string;
  bidderName: string;
  paymentReference: string;
  depositCents: bigint;
  lotTitle: string;
  caseNumber: string;
}

export interface StatementProposal {
  transactionCount: number;
  matches: ProposedDepositMatch[];
  unmatched: BankTransaction[];
}

const displayName = (b: BidderProfileRow): string =>
  b.type === 'COMPANY' && b.companyName ? b.companyName : b.fullName;

/**
 * Reads a bank statement (camt.053 XML or CSV) and proposes which payments cover which of the
 * trustee's open deposits. Nothing is stored and nothing is marked paid: the trustee confirms.
 */
export async function proposeDepositMatches(
  ctx: ServiceContext,
  actor: Actor,
  statementContent: string,
): Promise<StatementProposal> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const transactions = parseBankStatement(statementContent);
  const open = await ctx.uow.repos.auctionRegistrations.listAwaitingDepositByTrustee(trustee.id);

  const result = matchDeposits(
    transactions,
    open.map((o) => ({
      registrationId: o.registration.id,
      paymentReference: o.registration.paymentReference,
      depositCents: o.depositCents,
      payerNames: [o.bidder.fullName, o.bidder.companyName, o.bidder.representativeName].filter(
        (n): n is string => n !== null && n !== '',
      ),
    })),
  );
  const byId = new Map(open.map((o) => [o.registration.id, o]));

  return {
    transactionCount: transactions.length,
    matches: result.matches.flatMap((m: DepositMatch) => {
      const o = byId.get(m.registrationId);
      if (!o) return [];
      return [
        {
          registrationId: m.registrationId,
          confidence: m.confidence,
          transaction: m.transaction,
          pseudonym: o.registration.pseudonym,
          bidderName: displayName(o.bidder),
          paymentReference: o.registration.paymentReference,
          depositCents: o.depositCents,
          lotTitle: o.lotTitle,
          caseNumber: o.caseNumber,
        },
      ];
    }),
    unmatched: result.unmatched,
  };
}

export interface ConfirmResult {
  confirmed: string[];
  /** Lines that were not applied, with the reason. */
  skipped: { registrationId: string; reason: string }[];
}

/**
 * Applies the matches the trustee ticked. Every line is re-checked on the server: it must be
 * the trustee's registration, still unpaid, and the amount must equal the deposit exactly.
 */
export async function confirmDepositMatches(
  ctx: ServiceContext,
  actor: Actor,
  input: ConfirmDepositMatches,
): Promise<ConfirmResult> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const result: ConfirmResult = { confirmed: [], skipped: [] };

  for (const m of input.matches) {
    const skip = (reason: string) =>
      result.skipped.push({ registrationId: m.registrationId, reason });
    const d = await ctx.uow.repos.auctionRegistrations.findDetailed(m.registrationId);
    if (d?.case.trusteeId !== trustee.id) {
      skip('Prijava ne obstaja.');
      continue;
    }
    if (!BEFORE_LIVE.includes(d.auction.status)) {
      skip('Dražba ni več v fazi prijav.');
      continue;
    }
    if (d.registration.depositStatus !== 'PENDING') {
      skip('Varščina je že označena kot plačana.');
      continue;
    }
    if (m.amountCents !== d.auction.depositCents) {
      skip(
        `Znesek plačila (${formatCents(m.amountCents)}) ni enak varščini (${formatCents(d.auction.depositCents)}).`,
      );
      continue;
    }
    const note = `Bančni izpisek${m.bookingDate ? `, ${m.bookingDate}` : ''}: ${m.payerName || 'neznan plačnik'}${m.bankReference ? ` (${m.bankReference})` : ''}`;
    await ctx.uow.transaction((repos) =>
      markDepositPaid(ctx, repos, actor, d, note, {
        source: 'bank_statement',
        payerName: m.payerName,
        bookingDate: m.bookingDate,
        bankReference: m.bankReference,
      }),
    );
    result.confirmed.push(m.registrationId);
  }
  return result;
}
