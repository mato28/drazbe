import type { AuctionRegistrationRow, DocumentRow, SaleRow } from '@domik/db';
import { type Actor, type ServiceContext } from '../context';
import { notFound } from '../errors';
import { requireOwnAuction, requireTrustee } from '../trustee/access';
import { type SignatureCheck } from '../signatures/policy';
import { allowedSteps, currentDeadline, type SaleStep } from './sale';
import { saleAmounts, type SaleAmounts } from './terms';

export interface SaleView {
  sale: SaleRow;
  amounts: SaleAmounts;
  deadline: ReturnType<typeof currentDeadline>;
  nextSteps: SaleStep[];
  buyerName: string;
  buyerSignerName: string;
  trusteeName: string;
  contract: DocumentRow | null;
  buyerSigned: DocumentRow | null;
  signed: DocumentRow | null;
  buyerSignatureCheck: SignatureCheck | null;
  signedCheck: SignatureCheck | null;
}

export interface DepositView {
  registrationId: string;
  pseudonym: string;
  name: string;
  depositStatus: AuctionRegistrationRow['depositStatus'];
  refundIban: string | null;
  refundOrderDocId: string | null;
  refundedAt: Date | null;
}

export interface TrusteePostAuctionView {
  reports: { full: DocumentRow | null; public: DocumentRow | null };
  sale: SaleView | null;
  deposits: DepositView[];
  refundOrders: DocumentRow[];
}

const asCheck = (v: unknown): SignatureCheck | null =>
  v && typeof v === 'object' && 'ok' in v ? (v as SignatureCheck) : null;

async function saleView(ctx: ServiceContext, auctionId: string): Promise<SaleView | null> {
  const d = await ctx.uow.repos.sales.findDetailedByAuction(auctionId);
  if (!d) return null;
  const docs = await ctx.uow.repos.documents.listByOwner('SALE', d.sale.id);
  const byId = (id: string | null) => (id ? (docs.find((x) => x.id === id) ?? null) : null);
  return {
    sale: d.sale,
    amounts: saleAmounts(d.sale),
    deadline: currentDeadline(d.sale),
    nextSteps: allowedSteps(d.sale.status),
    buyerName:
      d.buyer.type === 'COMPANY' && d.buyer.companyName
        ? `${d.buyer.companyName} (zastopa ${d.buyer.fullName})`
        : d.buyer.fullName,
    buyerSignerName: d.buyer.fullName,
    trusteeName: d.trustee.name,
    contract: byId(d.sale.contractDocId),
    buyerSigned: byId(d.sale.buyerSignedDocId),
    signed: byId(d.sale.signedDocId),
    buyerSignatureCheck: asCheck(d.sale.buyerSignatureCheck),
    signedCheck: asCheck(d.sale.signedCheck),
  };
}

/** Trustee: reports, sale tracker and deposits of a closed auction. */
export async function getTrusteePostAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<TrusteePostAuctionView> {
  const trustee = await requireTrustee(ctx.uow.repos, actor);
  await requireOwnAuction(ctx.uow.repos, trustee, auctionId);
  const [docs, regs, sale] = await Promise.all([
    ctx.uow.repos.documents.listByOwner('AUCTION', auctionId),
    ctx.uow.repos.auctionRegistrations.listByAuctionWithBidder(auctionId),
    saleView(ctx, auctionId),
  ]);
  return {
    reports: {
      full: docs.find((x) => x.kind === 'AUCTION_REPORT') ?? null,
      public: docs.find((x) => x.kind === 'AUCTION_REPORT_PUBLIC') ?? null,
    },
    sale,
    deposits: regs
      .filter(({ registration: r }) => r.depositStatus !== 'PENDING')
      .map(({ registration: r, bidder: b }) => ({
        registrationId: r.id,
        pseudonym: r.pseudonym,
        name: b.type === 'COMPANY' && b.companyName ? b.companyName : b.fullName,
        depositStatus: r.depositStatus,
        refundIban: r.refundIban,
        refundOrderDocId: r.refundOrderDocId,
        refundedAt: r.refundedAt,
      })),
    refundOrders: docs.filter((x) => x.kind === 'REFUND_ORDER'),
  };
}

export interface BidderPostAuctionView {
  isBuyer: boolean;
  sale: SaleView | null;
  publicReport: DocumentRow | null;
  registration: Pick<
    AuctionRegistrationRow,
    'id' | 'depositStatus' | 'refundIban' | 'refundedAt' | 'refundOrderDocId'
  >;
}

/** Bidder: their deposit, the public report and — for the buyer — the sale. */
export async function getBidderPostAuction(
  ctx: ServiceContext,
  actor: Actor,
  auctionId: string,
): Promise<BidderPostAuctionView> {
  const { repos } = ctx.uow;
  const profile =
    actor.role === 'BIDDER' ? await repos.bidderProfiles.findByUserId(actor.userId) : undefined;
  const reg = profile
    ? await repos.auctionRegistrations.findByAuctionAndBidder(auctionId, profile.id)
    : undefined;
  if (!reg) throw notFound('Prijava');
  const [docs, sale] = await Promise.all([
    repos.documents.listByOwner('AUCTION', auctionId),
    repos.sales.findByAuctionId(auctionId),
  ]);
  const isBuyer = sale?.buyerRegistrationId === reg.id;
  const view = isBuyer ? await saleView(ctx, auctionId) : null;
  return {
    isBuyer,
    // It is the buyer's own contract: both signature checks are shown to them too.
    sale: view,
    publicReport: docs.find((x) => x.kind === 'AUCTION_REPORT_PUBLIC') ?? null,
    registration: {
      id: reg.id,
      depositStatus: reg.depositStatus,
      refundIban: reg.refundIban,
      refundedAt: reg.refundedAt,
      refundOrderDocId: reg.refundOrderDocId,
    },
  };
}
