import type { DocumentRow, Repositories, SaleRow, SaleStatus } from '@domik/db';
import { formatCents, formatDateTime } from '@domik/shared';
import { SALE_CONTRACT_TEMPLATE } from '../../templates/sale-contract';
import { auditSnapshot } from '../audit';
import { type Actor, type ServiceContext } from '../context';
import { storeGeneratedDocument } from '../documents/service';
import { detectFileType } from '../documents/file-type';
import { DomainError, notFound, validationError } from '../errors';
import { formatTimestamp } from './report';
import { fillContractTemplate } from './contract';
import { evaluateSignatures, type SignatureCheck } from './../signatures/policy';
import { bidderAuctionUrl, trusteeAuctionUrl } from './settlement';
import { addDays, saleAmounts } from './terms';
import { requireTrustee } from '../trustee/access';
import { MAX_DOCUMENT_BYTES } from '@domik/shared';

type SaleDetail = NonNullable<Awaited<ReturnType<Repositories['sales']['findDetailed']>>>;

/** Steps the trustee records after the contract is signed, in order. */
export const SALE_STEPS = [
  'DOWN_PAYMENT_PAID',
  'PRICE_PAID',
  'TRANSFER_PROPOSED',
  'TRANSFER_ORDER_ISSUED',
  'REGISTERED',
] as const;
export type SaleStep = (typeof SALE_STEPS)[number];

const ORDER: SaleStatus[] = [
  'AWAITING_CONTRACT',
  'CONTRACT_SIGNED',
  'DOWN_PAYMENT_PAID',
  'PRICE_PAID',
  'TRANSFER_PROPOSED',
  'TRANSFER_ORDER_ISSUED',
  'REGISTERED',
];

/** Name the buyer signs with: the natural person (for a company, its representative). */
export const buyerSignerName = (s: SaleDetail): string => s.buyer.fullName;
export const buyerDisplayName = (s: SaleDetail): string =>
  s.buyer.type === 'COMPANY' && s.buyer.companyName
    ? `${s.buyer.companyName} (zastopa ${s.buyer.fullName})`
    : s.buyer.fullName;

async function requireTrusteeSale(ctx: ServiceContext, actor: Actor, auctionId: string) {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  const sale = await ctx.uow.repos.sales.findDetailedByAuction(auctionId);
  if (sale?.trustee.id !== trustee.id) throw notFound('Prodaja');
  return sale;
}

async function requireBuyerSale(ctx: ServiceContext, actor: Actor, auctionId: string) {
  if (actor.role !== 'BIDDER') throw notFound('Prodaja');
  const profile = await ctx.uow.repos.bidderProfiles.findByUserId(actor.userId);
  const sale = await ctx.uow.repos.sales.findDetailedByAuction(auctionId);
  if (!profile || sale?.buyer.id !== profile.id) throw notFound('Prodaja');
  return sale;
}

/** Changes a sale under a row lock, with an audit entry. `check` runs on the locked row. */
async function changeSale(
  ctx: ServiceContext,
  actor: Actor | null,
  saleId: string,
  action: string,
  check: (s: SaleRow) => void,
  patch: (s: SaleRow, tx: Repositories) => Promise<Partial<SaleRow>> | Partial<SaleRow>,
): Promise<SaleRow> {
  return ctx.uow.transaction(async (tx) => {
    const before = await tx.sales.lockById(saleId);
    if (!before) throw notFound('Prodaja');
    check(before);
    const after = await tx.sales.update(saleId, {
      ...(await patch(before, tx)),
      updatedBy: actor?.userId ?? null,
    });
    if (!after) throw notFound('Prodaja');
    await tx.auditLog.append({
      actorId: actor?.userId ?? null,
      entity: 'sale',
      entityId: saleId,
      action,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      at: ctx.clock.now(),
    });
    return after;
  });
}

function assertPdf(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw validationError({ file: 'Datoteka je prazna.' });
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw validationError({
      file: `Datoteka je prevelika (največ ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB).`,
    });
  }
  if (detectFileType(bytes)?.extension !== 'pdf') {
    throw validationError({ file: 'Podpisana pogodba mora biti datoteka PDF.' });
  }
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export interface ContractTermsInput {
  downPaymentCents?: bigint;
  downPaymentDays?: number;
  priceDays?: number;
}

const orDash = (v: string | null | undefined): string => (v && v.trim() !== '' ? v : '—');

/** Values for every placeholder of the contract template. */
export function contractValues(
  s: SaleDetail,
  reportSha256: string,
  generatedAt: Date,
): Record<string, string> {
  const a = saleAmounts(s.sale);
  const trusteeName = s.trustee.firmName
    ? `${s.trustee.name} (${s.trustee.firmName})`
    : s.trustee.name;
  return {
    contractNumber: `${String(s.auction.number)}/${String(generatedAt.getUTCFullYear())}`,
    debtorName: s.case.debtorName,
    debtorAddress: [s.case.debtorAddress, s.case.debtorCity].filter(Boolean).join(', ') || '—',
    debtorTaxId: s.case.debtorTaxId,
    trusteeName,
    buyerName: buyerDisplayName(s),
    buyerAddress: s.buyer.address,
    buyerTaxId: s.buyer.taxId,
    buyerPseudonym: s.registration.pseudonym,
    court: s.case.court,
    caseNumber: s.case.caseNumber,
    courtApproval: orDash(s.auction.courtApprovalRef),
    auctionNumber: String(s.auction.number),
    auctionClosedAt: s.auction.closedAt ? formatDateTime(s.auction.closedAt) : '—',
    reportHash: reportSha256,
    lotTitle: s.lot.title,
    lotAddress: orDash(s.lot.address),
    lotIdZnak: orDash(s.lot.idZnak),
    lotCadastre:
      [s.lot.cadastralMunicipality, s.lot.parcelNumber].filter(Boolean).join(', parc. št. ') || '—',
    lotArea: s.lot.areaM2 ? `${s.lot.areaM2.replace('.', ',')} m²` : '—',
    lotEncumbrances: orDash(s.lot.encumbrancesText),
    price: formatCents(a.priceCents),
    deposit: formatCents(a.depositAppliedCents),
    downPaymentDue: formatCents(a.downPaymentDueCents),
    downPaymentDays: String(s.sale.downPaymentDays),
    remainder: formatCents(a.remainderCents),
    priceDays: String(s.sale.priceDays),
    estateIban: s.case.estateIban,
    estateBank: s.case.estateBank,
    paymentReference: s.registration.paymentReference,
    generatedAt: formatTimestamp(generatedAt),
    templateVersion: SALE_CONTRACT_TEMPLATE.version,
  };
}

/**
 * Trustee: generates (or regenerates, until the buyer has signed) the sale contract PDF from
 * the template, optionally changing the payment terms. Needs the auction report (its hash is
 * cited in the contract).
 */
export async function generateContract(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  terms: ContractTermsInput = {},
): Promise<DocumentRow> {
  const detail = await requireTrusteeSale(ctx, actor, auctionId);
  if (detail.sale.status !== 'AWAITING_CONTRACT' || detail.sale.buyerSignedDocId) {
    throw new DomainError(
      'CONFLICT',
      'Pogodbo je kupec že podpisal, zato je ni več mogoče spremeniti.',
    );
  }
  const fields: Record<string, string> = {};
  if (terms.downPaymentCents !== undefined) {
    if (terms.downPaymentCents < 0n || terms.downPaymentCents > detail.sale.priceCents) {
      fields.downPaymentCents = 'Ara mora biti med 0 in kupnino.';
    }
  }
  for (const key of ['downPaymentDays', 'priceDays'] as const) {
    const v = terms[key];
    if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > 365)) {
      fields[key] = 'Rok mora biti med 1 in 365 dni.';
    }
  }
  const downPaymentDays = terms.downPaymentDays ?? detail.sale.downPaymentDays;
  const priceDays = terms.priceDays ?? detail.sale.priceDays;
  if (priceDays < downPaymentDays)
    fields.priceDays = 'Rok za kupnino ne sme biti krajši od roka za aro.';
  if (Object.keys(fields).length > 0) throw validationError(fields);

  const report = (await ctx.uow.repos.documents.listByOwner('AUCTION', auctionId)).find(
    (d) => d.kind === 'AUCTION_REPORT',
  );
  if (!report) {
    throw new DomainError('CONFLICT', 'Zapisnik o dražbi še ni pripravljen. Poskusite čez minuto.');
  }

  const now = ctx.clock.now();
  const sale: SaleRow = {
    ...detail.sale,
    downPaymentCents: terms.downPaymentCents ?? detail.sale.downPaymentCents,
    downPaymentDays,
    priceDays,
  };
  const content = fillContractTemplate(
    SALE_CONTRACT_TEMPLATE,
    contractValues({ ...detail, sale }, report.sha256, now),
  );
  const bytes = await ctx.pdf.render(content);
  const doc = await storeGeneratedDocument(
    ctx,
    actor.userId,
    {
      ownerType: 'SALE',
      ownerId: sale.id,
      kind: 'SALE_CONTRACT',
      filename: `prodajna-pogodba-drazba-${String(detail.auction.number)}.pdf`,
      bytes,
      mime: 'application/pdf',
      extension: 'pdf',
      keyPrefix: `sales/${sale.id}`,
    },
    async (tx, row) => {
      const locked = await tx.sales.lockById(sale.id);
      if (locked?.buyerSignedDocId) {
        throw new DomainError('CONFLICT', 'Pogodbo je kupec medtem že podpisal.');
      }
      await tx.sales.update(sale.id, {
        contractDocId: row.id,
        downPaymentCents: sale.downPaymentCents,
        downPaymentDays,
        priceDays,
        updatedBy: actor.userId,
      });
      await tx.auditLog.append({
        actorId: actor.userId,
        entity: 'sale',
        entityId: sale.id,
        action: 'sale.contract_generated',
        after: {
          documentId: row.id,
          sha256: row.sha256,
          templateVersion: SALE_CONTRACT_TEMPLATE.version,
          downPaymentCents: sale.downPaymentCents.toString(),
          downPaymentDays,
          priceDays,
        },
        at: now,
      });
      const buyerUser = await tx.users.findById(detail.buyer.userId);
      if (buyerUser) {
        await tx.notificationsOutbox.enqueue({
          template: 'sale.contract_ready',
          recipient: buyerUser.email,
          payload: {
            lotTitle: detail.lot.title,
            contractDeadline: formatDateTime(detail.sale.contractDeadline),
            url: bidderAuctionUrl(ctx.appUrl, auctionId),
          },
          // A regenerated contract is announced again.
          dedupeKey: `sale.contract_ready:${row.id}`,
        });
      }
    },
  );
  return doc;
}

async function checkSignatures(
  ctx: ServiceContext,
  file: { bytes: Uint8Array; filename: string },
  expected: string[],
): Promise<SignatureCheck> {
  let report;
  try {
    report = await ctx.signatures.validate(file);
  } catch {
    throw new DomainError(
      'CONFLICT',
      'Storitev za preverjanje elektronskih podpisov trenutno ni dosegljiva. Poskusite znova kasneje.',
    );
  }
  return evaluateSignatures(report, expected, ctx.signaturePolicy, ctx.clock.now());
}

export class SignatureRejectedError extends DomainError {
  readonly check: SignatureCheck;
  constructor(check: SignatureCheck) {
    super('VALIDATION', 'Podpis pogodbe ni ustrezen.', {
      file: check.problems.join(' '),
    });
    this.check = check;
  }
}

/**
 * Buyer: uploads the contract signed with their (qualified) electronic signature. The
 * signature is validated (EU DSS) before the file is accepted: valid, qualified (per policy)
 * and the signer's name matches the buyer.
 */
export async function uploadBuyerSignedContract(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  file: { bytes: Uint8Array; filename: string },
): Promise<{ document: DocumentRow; check: SignatureCheck }> {
  const detail = await requireBuyerSale(ctx, actor, auctionId);
  if (detail.sale.status !== 'AWAITING_CONTRACT') {
    throw new DomainError('CONFLICT', 'Pogodba je že sklenjena.');
  }
  if (!detail.sale.contractDocId) {
    throw new DomainError('CONFLICT', 'Upravitelj pogodbe še ni pripravil.');
  }
  assertPdf(file.bytes);
  const check = await checkSignatures(ctx, file, [buyerSignerName(detail)]);
  if (!check.ok) throw new SignatureRejectedError(check);

  const document = await storeGeneratedDocument(
    ctx,
    actor.userId,
    {
      ownerType: 'SALE',
      ownerId: detail.sale.id,
      kind: 'SALE_CONTRACT_SIGNED_BUYER',
      filename: file.filename,
      bytes: file.bytes,
      mime: 'application/pdf',
      extension: 'pdf',
      keyPrefix: `sales/${detail.sale.id}`,
    },
    async (tx, row) => {
      const locked = await tx.sales.lockById(detail.sale.id);
      if (locked?.status !== 'AWAITING_CONTRACT') {
        throw new DomainError('CONFLICT', 'Pogodba je že sklenjena.');
      }
      await tx.sales.update(detail.sale.id, {
        buyerSignedDocId: row.id,
        buyerSignatureCheck: check,
        updatedBy: actor.userId,
      });
      await tx.auditLog.append({
        actorId: actor.userId,
        entity: 'sale',
        entityId: detail.sale.id,
        action: 'sale.buyer_signed',
        after: { documentId: row.id, sha256: row.sha256, check },
        at: ctx.clock.now(),
      });
      await tx.notificationsOutbox.enqueue({
        template: 'sale.reminder',
        recipient: detail.trusteeUser.email,
        payload: {
          lotTitle: detail.lot.title,
          task: 'kupec je podpisal pogodbo – podpišite jo še vi',
          deadline: formatDateTime(detail.sale.contractDeadline),
          url: trusteeAuctionUrl(ctx.appUrl, auctionId),
        },
        dedupeKey: `sale.buyer_signed:${row.id}`,
      });
    },
  );
  return { document, check };
}

/** Contract concluded: deadlines for payments run from the signing date. */
function signedPatch(s: SaleRow, signedAt: Date): Partial<SaleRow> {
  return {
    status: 'CONTRACT_SIGNED',
    contractSignedAt: signedAt,
    downPaymentDeadline: addDays(signedAt, s.downPaymentDays),
    priceDeadline: addDays(signedAt, s.priceDays),
  };
}

/**
 * Trustee: uploads the contract carrying both signatures (the buyer's signed PDF, counter-
 * signed by the trustee). Both signatures are validated. Concludes the contract.
 */
export async function uploadTrusteeSignedContract(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  file: { bytes: Uint8Array; filename: string },
): Promise<{ document: DocumentRow; check: SignatureCheck; sale: SaleRow }> {
  const detail = await requireTrusteeSale(ctx, actor, auctionId);
  if (detail.sale.status !== 'AWAITING_CONTRACT') {
    throw new DomainError('CONFLICT', 'Pogodba je že sklenjena.');
  }
  if (!detail.sale.buyerSignedDocId) {
    throw new DomainError('CONFLICT', 'Kupec pogodbe še ni podpisal.');
  }
  assertPdf(file.bytes);
  const check = await checkSignatures(ctx, file, [buyerSignerName(detail), detail.trustee.name]);
  if (!check.ok) throw new SignatureRejectedError(check);

  let sale: SaleRow | undefined;
  const document = await storeGeneratedDocument(
    ctx,
    actor.userId,
    {
      ownerType: 'SALE',
      ownerId: detail.sale.id,
      kind: 'SALE_CONTRACT_SIGNED',
      filename: file.filename,
      bytes: file.bytes,
      mime: 'application/pdf',
      extension: 'pdf',
      keyPrefix: `sales/${detail.sale.id}`,
    },
    async (tx, row) => {
      sale = await concludeContract(ctx, tx, actor, detail, {
        signedDocId: row.id,
        signedCheck: check,
        signedOnPaper: false,
      });
    },
  );
  if (!sale) throw new Error('sale not updated');
  return { document, check, sale };
}

async function concludeContract(
  ctx: ServiceContext,
  tx: Repositories,
  actor: Actor,
  detail: SaleDetail,
  patch: Partial<SaleRow>,
  signedAt: Date = ctx.clock.now(),
): Promise<SaleRow> {
  const locked = await tx.sales.lockById(detail.sale.id);
  if (locked?.status !== 'AWAITING_CONTRACT') {
    throw new DomainError('CONFLICT', 'Pogodba je že sklenjena.');
  }
  const after = await tx.sales.update(detail.sale.id, {
    ...patch,
    ...signedPatch(locked, signedAt),
    updatedBy: actor.userId,
  });
  if (!after) throw notFound('Prodaja');
  await tx.auditLog.append({
    actorId: actor.userId,
    entity: 'sale',
    entityId: detail.sale.id,
    action: 'sale.contract_signed',
    before: auditSnapshot(locked),
    after: auditSnapshot(after),
    at: ctx.clock.now(),
  });
  const buyerUser = await tx.users.findById(detail.buyer.userId);
  if (buyerUser && after.downPaymentDeadline && after.priceDeadline) {
    const due = saleAmounts(after);
    await tx.notificationsOutbox.enqueue({
      template: 'sale.reminder',
      recipient: buyerUser.email,
      payload: {
        lotTitle: detail.lot.title,
        task:
          due.downPaymentDueCents > 0n
            ? `plačilo are ${formatCents(due.downPaymentDueCents)}`
            : `plačilo kupnine ${formatCents(due.totalDueCents)}`,
        deadline: formatDateTime(
          due.downPaymentDueCents > 0n ? after.downPaymentDeadline : after.priceDeadline,
        ),
        url: bidderAuctionUrl(ctx.appUrl, detail.auction.id),
      },
      dedupeKey: `sale.signed:${detail.sale.id}`,
    });
  }
  return after;
}

/**
 * Trustee fallback: the contract was signed on paper. Upload a scan; the signing date is
 * the date on the paper contract (not in the future).
 */
export async function markSignedOnPaper(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  input: { bytes: Uint8Array; filename: string; signedAt: Date },
): Promise<{ document: DocumentRow; sale: SaleRow }> {
  const detail = await requireTrusteeSale(ctx, actor, auctionId);
  if (detail.sale.status !== 'AWAITING_CONTRACT') {
    throw new DomainError('CONFLICT', 'Pogodba je že sklenjena.');
  }
  const now = ctx.clock.now();
  if (input.signedAt.getTime() > now.getTime()) {
    throw validationError({ signedAt: 'Datum podpisa ne sme biti v prihodnosti.' });
  }
  if (
    detail.auction.closedAt &&
    input.signedAt.getTime() < detail.auction.closedAt.getTime() - 86_400_000
  ) {
    throw validationError({ signedAt: 'Pogodba ne more biti podpisana pred koncem dražbe.' });
  }
  if (input.bytes.byteLength === 0) throw validationError({ file: 'Datoteka je prazna.' });
  const type = detectFileType(input.bytes);
  if (!type) throw validationError({ file: 'Dovoljene so samo datoteke PDF, JPG, PNG in WEBP.' });

  let sale: SaleRow | undefined;
  const document = await storeGeneratedDocument(
    ctx,
    actor.userId,
    {
      ownerType: 'SALE',
      ownerId: detail.sale.id,
      kind: 'SALE_CONTRACT_PAPER_SCAN',
      filename: input.filename,
      bytes: input.bytes,
      mime: type.mime,
      extension: type.extension,
      keyPrefix: `sales/${detail.sale.id}`,
    },
    async (tx, row) => {
      sale = await concludeContract(
        ctx,
        tx,
        actor,
        detail,
        { signedDocId: row.id, signedOnPaper: true, signedCheck: null },
        input.signedAt,
      );
    },
  );
  if (!sale) throw new Error('sale not updated');
  return { document, sale };
}

// ---------------------------------------------------------------------------
// Post-sale status tracker
// ---------------------------------------------------------------------------

export interface SaleStepInput {
  step: SaleStep;
  /** When it happened (default: now). Not in the future. */
  at?: Date;
  /** Sklep o izročitvi: opravilna št.; ZK: Dn number. */
  reference?: string;
}

const STEP_FIELDS: Record<SaleStep, { at: keyof SaleRow; ref?: keyof SaleRow }> = {
  DOWN_PAYMENT_PAID: { at: 'downPaymentPaidAt' },
  PRICE_PAID: { at: 'pricePaidAt' },
  TRANSFER_PROPOSED: { at: 'transferProposedAt' },
  TRANSFER_ORDER_ISSUED: { at: 'transferOrderIssuedAt', ref: 'transferOrderRef' },
  REGISTERED: { at: 'registeredAt', ref: 'registrationRef' },
};

/** Which steps may be recorded from `status` (paying the full price also covers the down payment). */
export function allowedSteps(status: SaleStatus): SaleStep[] {
  switch (status) {
    case 'CONTRACT_SIGNED':
      return ['DOWN_PAYMENT_PAID', 'PRICE_PAID'];
    case 'DOWN_PAYMENT_PAID':
      return ['PRICE_PAID'];
    case 'PRICE_PAID':
      return ['TRANSFER_PROPOSED'];
    case 'TRANSFER_PROPOSED':
      return ['TRANSFER_ORDER_ISSUED'];
    case 'TRANSFER_ORDER_ISSUED':
      return ['REGISTERED'];
    default:
      return [];
  }
}

/** Trustee: records the next step of the sale (payment received, transfer proposed, …). */
export async function recordSaleStep(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  input: SaleStepInput,
): Promise<SaleRow> {
  const detail = await requireTrusteeSale(ctx, actor, auctionId);
  const now = ctx.clock.now();
  const at = input.at ?? now;
  if (at.getTime() > now.getTime()) {
    throw validationError({ at: 'Datum ne sme biti v prihodnosti.' });
  }
  const fields = STEP_FIELDS[input.step];
  const reference = input.reference?.trim() ?? '';
  if (fields.ref && reference === '') {
    throw validationError({
      reference:
        input.step === 'REGISTERED'
          ? 'Vnesite številko zadeve v zemljiški knjigi (Dn).'
          : 'Vnesite opravilno številko sklepa o izročitvi.',
    });
  }
  const after = await changeSale(
    ctx,
    actor,
    detail.sale.id,
    `sale.${input.step.toLowerCase()}`,
    (s) => {
      if (!allowedSteps(s.status).includes(input.step)) {
        throw new DomainError('CONFLICT', 'Ta korak v trenutnem stanju prodaje ni mogoč.');
      }
      if (s.contractSignedAt && at.getTime() < s.contractSignedAt.getTime() - 86_400_000) {
        throw validationError({ at: 'Datum ne more biti pred podpisom pogodbe.' });
      }
    },
    (s) => ({
      status: input.step,
      [fields.at]: at,
      ...(fields.ref ? { [fields.ref]: reference } : {}),
      ...(input.step === 'PRICE_PAID' && !s.downPaymentPaidAt ? { downPaymentPaidAt: at } : {}),
    }),
  );
  if (input.step === 'REGISTERED' || input.step === 'TRANSFER_ORDER_ISSUED') {
    const user = await ctx.uow.repos.users.findById(detail.buyer.userId);
    if (user) {
      await ctx.uow.repos.notificationsOutbox.enqueue({
        template: 'sale.reminder',
        recipient: user.email,
        payload: {
          lotTitle: detail.lot.title,
          task:
            input.step === 'REGISTERED'
              ? `vpis lastninske pravice v zemljiško knjigo (${reference})`
              : `sodišče je izdalo sklep o izročitvi (${reference})`,
          deadline: formatDateTime(at),
          url: bidderAuctionUrl(ctx.appUrl, auctionId),
        },
        dedupeKey: `sale.${input.step.toLowerCase()}:${detail.sale.id}`,
      });
    }
  }
  return after;
}

// LEGAL-REVIEW: buyer default — deposit forfeiture and what happens to the lot next (new auction vs. offer to the next bidder) — see docs/legal-review.md
/**
 * Trustee: the buyer did not sign or pay in time. The sale is DEFAULTED and the buyer's
 * deposit is FORFEITED to the estate.
 */
export async function declareDefault(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
  reason: string,
): Promise<SaleRow> {
  const detail = await requireTrusteeSale(ctx, actor, auctionId);
  const text = reason.trim();
  if (text.length < 5) throw validationError({ reason: 'Navedite razlog (vsaj 5 znakov).' });
  const now = ctx.clock.now();
  return changeSale(
    ctx,
    actor,
    detail.sale.id,
    'sale.defaulted',
    (s) => {
      if (!['AWAITING_CONTRACT', 'CONTRACT_SIGNED', 'DOWN_PAYMENT_PAID'].includes(s.status)) {
        throw new DomainError(
          'CONFLICT',
          'Neizpolnitev je mogoče ugotoviti le pred plačilom kupnine.',
        );
      }
      const deadline = currentDeadline(s);
      if (deadline && deadline.at.getTime() > now.getTime()) {
        throw new DomainError(
          'CONFLICT',
          `Rok (${deadline.task}) še ni potekel – izteče se ${formatDateTime(deadline.at)}.`,
        );
      }
    },
    async (_s, tx) => {
      const reg = await tx.auctionRegistrations.update(detail.registration.id, {
        depositStatus: 'FORFEITED',
      });
      await tx.auditLog.append({
        actorId: actor.userId,
        entity: 'auction_registration',
        entityId: detail.registration.id,
        action: 'deposit.forfeited',
        before: { depositStatus: detail.registration.depositStatus },
        after: { depositStatus: reg?.depositStatus ?? 'FORFEITED', reason: text },
        at: now,
      });
      const user = await tx.users.findById(detail.buyer.userId);
      if (user) {
        await tx.notificationsOutbox.enqueue({
          template: 'sale.defaulted',
          recipient: user.email,
          payload: {
            lotTitle: detail.lot.title,
            reason: text,
            url: bidderAuctionUrl(ctx.appUrl, auctionId),
          },
          dedupeKey: `sale.defaulted:${detail.sale.id}`,
        });
      }
      return { status: 'DEFAULTED' as const, defaultedAt: now, defaultReason: text };
    },
  );
}

/** What the buyer must do next and by when (null once the price is paid or the sale ended). */
export function currentDeadline(
  s: Pick<
    SaleRow,
    | 'status'
    | 'contractDeadline'
    | 'downPaymentDeadline'
    | 'priceDeadline'
    | 'priceCents'
    | 'depositAppliedCents'
    | 'downPaymentCents'
  >,
): { task: string; at: Date; kind: 'CONTRACT' | 'DOWN_PAYMENT' | 'PRICE' } | null {
  const due = saleAmounts(s);
  switch (s.status) {
    case 'AWAITING_CONTRACT':
      return { task: 'podpis prodajne pogodbe', at: s.contractDeadline, kind: 'CONTRACT' };
    case 'CONTRACT_SIGNED':
      if (due.downPaymentDueCents > 0n && s.downPaymentDeadline) {
        return {
          task: `plačilo are ${formatCents(due.downPaymentDueCents)}`,
          at: s.downPaymentDeadline,
          kind: 'DOWN_PAYMENT',
        };
      }
      return s.priceDeadline
        ? {
            task: `plačilo kupnine ${formatCents(due.totalDueCents)}`,
            at: s.priceDeadline,
            kind: 'PRICE',
          }
        : null;
    case 'DOWN_PAYMENT_PAID':
      return s.priceDeadline
        ? {
            task: `plačilo preostanka kupnine ${formatCents(due.remainderCents)}`,
            at: s.priceDeadline,
            kind: 'PRICE',
          }
        : null;
    default:
      return null;
  }
}

export const isStatusAtLeast = (status: SaleStatus, target: SaleStatus): boolean =>
  status !== 'DEFAULTED' && ORDER.indexOf(status) >= ORDER.indexOf(target);
