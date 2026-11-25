import { and, asc, count, eq, gt, gte, inArray, isNotNull, lte, or, type SQL } from 'drizzle-orm';
import { type Executor } from '../client';
import { auctions, documents, insolvencyCases, lots, trustees } from '../schema';

type AuctionStatus = (typeof auctions.$inferSelect)['status'];
type AuctionType = (typeof auctions.$inferSelect)['type'];
type PropertyKind = (typeof lots.$inferSelect)['propertyKind'];

/** Phases the public can filter by (derived from status + registration deadline). */
export type PublicListPhase = 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'LIVE';

export interface PublicAuctionFilter {
  /** Statuses that may appear at all. The caller (core) decides what is public. */
  statuses: readonly AuctionStatus[];
  now: Date;
  phase?: PublicListPhase | undefined;
  auctionType?: AuctionType | undefined;
  propertyKind?: PropertyKind | undefined;
  municipality?: string | undefined;
  minPriceCents?: bigint | undefined;
  maxPriceCents?: bigint | undefined;
}

function phaseCondition(phase: PublicListPhase, now: Date): SQL | undefined {
  switch (phase) {
    case 'REGISTRATION_OPEN':
      return and(eq(auctions.status, 'PUBLISHED'), gt(auctions.registrationDeadline, now));
    case 'REGISTRATION_CLOSED':
      return or(
        eq(auctions.status, 'REGISTRATION_CLOSED'),
        and(eq(auctions.status, 'PUBLISHED'), lte(auctions.registrationDeadline, now)),
      );
    case 'LIVE':
      return inArray(auctions.status, ['LIVE', 'PREEMPTION']);
  }
}

/** Public = in an allowed status AND actually published at some point (never a bare draft). */
function isPublic(statuses: readonly AuctionStatus[]): SQL | undefined {
  return and(inArray(auctions.status, [...statuses]), isNotNull(auctions.publishedAt));
}

function where(f: PublicAuctionFilter): SQL | undefined {
  return and(
    isPublic(f.statuses),
    f.phase ? phaseCondition(f.phase, f.now) : undefined,
    f.auctionType ? eq(auctions.type, f.auctionType) : undefined,
    f.propertyKind ? eq(lots.propertyKind, f.propertyKind) : undefined,
    f.municipality ? eq(lots.municipality, f.municipality) : undefined,
    f.minPriceCents !== undefined ? gte(auctions.startingPriceCents, f.minPriceCents) : undefined,
    f.maxPriceCents !== undefined ? lte(auctions.startingPriceCents, f.maxPriceCents) : undefined,
  );
}

/** Read-only queries behind the public pages. Joins are explicit so nothing leaks by accident. */
export function publicAuctionsRepository(db: Executor) {
  const base = () =>
    db
      .select({ auction: auctions, lot: lots, case: insolvencyCases, trustee: trustees })
      .from(auctions)
      .innerJoin(lots, eq(auctions.lotId, lots.id))
      .innerJoin(insolvencyCases, eq(lots.caseId, insolvencyCases.id))
      .innerJoin(trustees, eq(insolvencyCases.trusteeId, trustees.id));

  return {
    async list(filter: PublicAuctionFilter, limit: number, offset: number) {
      return base()
        .where(where(filter))
        .orderBy(asc(auctions.startsAt), asc(auctions.id))
        .limit(limit)
        .offset(offset);
    },

    async count(filter: PublicAuctionFilter): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(auctions)
        .innerJoin(lots, eq(auctions.lotId, lots.id))
        .where(where(filter));
      return row?.n ?? 0;
    },

    /** Distinct towns that currently have a listed auction (for the location filter). */
    async listMunicipalities(statuses: readonly AuctionStatus[]): Promise<string[]> {
      const rows = await db
        .selectDistinct({ municipality: lots.municipality })
        .from(auctions)
        .innerJoin(lots, eq(auctions.lotId, lots.id))
        .where(isPublic(statuses))
        .orderBy(asc(lots.municipality));
      return rows.map((r) => r.municipality).filter((m): m is string => m !== null && m !== '');
    },

    async findById(id: string, statuses: readonly AuctionStatus[]) {
      const [row] = await base().where(and(eq(auctions.id, id), isPublic(statuses)));
      return row;
    },

    /** Documents of the given lots, oldest first. */
    async listLotDocuments(lotIds: string[]) {
      if (lotIds.length === 0) return [];
      return db
        .select()
        .from(documents)
        .where(and(eq(documents.ownerType, 'LOT'), inArray(documents.ownerId, lotIds)))
        .orderBy(asc(documents.createdAt));
    },

    /** Does this lot have an auction in one of `statuses`? */
    async lotHasAuctionIn(lotId: string, statuses: readonly AuctionStatus[]): Promise<boolean> {
      const [row] = await db
        .select({ n: count() })
        .from(auctions)
        .where(and(eq(auctions.lotId, lotId), isPublic(statuses)));
      return (row?.n ?? 0) > 0;
    },
  };
}
