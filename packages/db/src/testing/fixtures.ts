import { createHash, randomUUID } from 'node:crypto';
import { type Database } from '../client';
import { createRepositories } from '../repositories';
import { users } from '../schema';

export const sha256Hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex');

/** Unwraps Drizzle's query error to the underlying Postgres message. */
export async function dbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message}\n${err.cause?.message ?? ''}`;
  }
  throw new Error('expected the query to fail, but it succeeded');
}

/** Creates trustee -> case -> lot -> ascending auction -> one approved registration. */
export async function createAuctionFixture(db: Database) {
  const repos = createRepositories(db);
  const tag = randomUUID().slice(0, 8);

  const [trusteeUser] = await db
    .insert(users)
    .values({
      name: 'Upravitelj',
      email: `t-${tag}@test.local`,
      role: 'TRUSTEE',
      emailVerified: true,
    })
    .returning();
  const [bidderUser] = await db
    .insert(users)
    .values({
      name: 'Dražitelj',
      email: `b-${tag}@test.local`,
      role: 'BIDDER',
      emailVerified: true,
    })
    .returning();

  const trustee = await repos.trustees.create({
    userId: trusteeUser!.id,
    name: 'Test Upravitelj',
    licenseNumber: `LIC-${tag}`,
  });
  const insolvencyCase = await repos.insolvencyCases.create({
    trusteeId: trustee.id,
    court: 'Okrožno sodišče v Ljubljani',
    caseNumber: `St ${tag}/2026`,
    debtorName: 'Dolžnik d.o.o. - v stečaju',
    debtorTaxId: '12345678',
    estateIban: 'SI56191000000123438',
    estateBank: 'Banka d.d.',
  });
  const lot = await repos.lots.create({ caseId: insolvencyCase.id, title: 'Stanovanje' });

  const startsAt = new Date('2030-01-10T09:00:00Z');
  const auction = await repos.auctions.create({
    lotId: lot.id,
    type: 'ASCENDING',
    startingPriceCents: 10_000_000n,
    bidIncrementCents: 100_000n,
    startsAt,
    endsAt: new Date('2030-01-10T10:00:00Z'),
    registrationDeadline: new Date('2030-01-08T09:00:00Z'),
    depositCents: 1_000_000n,
  });
  const bidder = await repos.bidderProfiles.create({
    userId: bidderUser!.id,
    type: 'PERSON',
    fullName: 'Janez Novak',
    taxId: '87654321',
    address: 'Slovenska cesta 1, 1000 Ljubljana',
    status: 'VERIFIED',
  });
  const registration = await repos.auctionRegistrations.create({
    auctionId: auction.id,
    bidderId: bidder.id,
    seq: 1,
    pseudonym: 'Dražitelj 1',
    paymentReference: `SI00 ${tag}`,
    status: 'APPROVED',
    depositStatus: 'PAID',
    approvedBy: trusteeUser!.id,
    approvedAt: new Date(),
  });

  return {
    repos,
    trusteeUser: trusteeUser!,
    trustee,
    insolvencyCase,
    lot,
    auction,
    bidder,
    registration,
  };
}

/** Builds the next valid bid in the chain (hash content is irrelevant to the DB). */
export function chainedBid(
  auctionId: string,
  registrationId: string,
  seq: number,
  prevHash: string,
  amountCents: bigint,
) {
  return {
    auctionId,
    registrationId,
    seq,
    amountCents,
    prevHash,
    hash: sha256Hex(`${prevHash}|${auctionId}|Dražitelj 1|${amountCents}|${seq}`),
  };
}
