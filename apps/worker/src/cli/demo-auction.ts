/**
 * DEVELOPMENT / STAGING ONLY: creates a published auction that starts in ~1 minute, with both seed
 * bidders (drazitelj1/2@domik.local) registered and APPROVED — for trying live bidding in two
 * browsers. Requires `pnpm db:seed` first; the worker must be running to start the auction.
 *
 *   pnpm demo-auction asc [seconds]  # ascending, 5 minutes (or [seconds]), anti-sniping 120 s
 *   pnpm demo-auction desc           # descending, 20 s steps
 *   pnpm demo-auction desc-switch    # descending, continues as ascending after the first accept
 *   pnpm demo-auction preemption     # ascending, bidder 2 is a pre-emption holder
 */
import { buildDepositReference } from '@domik/core';
import { createDb, createRepositories } from '@domik/db';

const args = process.argv.slice(2).filter((a) => a !== '--');
const kind = args[0] ?? 'asc';
/** Ascending main-phase length in seconds (default 5 minutes). */
const durationSec = Number(args[1] ?? 300);
const KINDS = ['asc', 'desc', 'desc-switch', 'preemption'];
if (!KINDS.includes(kind) || !Number.isInteger(durationSec) || durationSec < 10) {
  console.error(`Usage: pnpm demo-auction <${KINDS.join('|')}> [ascending seconds >= 10]`);
  process.exit(2);
}
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_DATA !== 'true') {
  console.error(
    'Refusing to create demo data in production (set ALLOW_DEMO_DATA=true on staging).',
  );
  process.exit(2);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const handle = createDb(databaseUrl, { max: 1 });
try {
  const repos = createRepositories(handle.db);
  const trusteeUser = await repos.users.findByEmail('upravitelj@domik.local');
  const trustee = trusteeUser && (await repos.trustees.findByUserId(trusteeUser.id));
  const cases = trustee ? await repos.insolvencyCases.listByTrustee(trustee.id) : [];
  const bidderUsers = await Promise.all(
    ['drazitelj1@domik.local', 'drazitelj2@domik.local'].map((e) => repos.users.findByEmail(e)),
  );
  const profiles = [];
  for (const u of bidderUsers) {
    const p = u ? await repos.bidderProfiles.findByUserId(u.id) : undefined;
    if (p) profiles.push(p);
  }
  const [insolvencyCase] = cases;
  if (!trusteeUser || !insolvencyCase || profiles.length < 2) {
    throw new Error('Seed data not found — run `pnpm db:seed` first.');
  }

  const now = Date.now();
  const startsAt = new Date(Math.ceil((now + 60_000) / 1000) * 1000);
  const label = {
    asc: 'zviševanje',
    desc: 'zniževanje',
    'desc-switch': 'zniževanje → zviševanje',
    preemption: 'predkupna pravica',
  }[kind];
  const lot = await repos.lots.create({
    caseId: insolvencyCase.id,
    type: 'REAL_ESTATE',
    propertyKind: 'APARTMENT',
    municipality: 'Ljubljana',
    title: `Demo dražba (${label ?? kind}) ${new Date(now).toISOString().slice(11, 19)}`,
    description: 'Testna dražba za preizkus draženja v živo.',
    appraisalValueCents: 15_000_000n,
  });
  const descending = kind === 'desc' || kind === 'desc-switch';
  const auction = await repos.auctions.create({
    lotId: lot.id,
    status: 'PUBLISHED',
    publishedAt: new Date(now),
    courtApprovalRef: 'Demo',
    type: descending ? 'DESCENDING' : 'ASCENDING',
    startingPriceCents: 10_000_000n,
    ...(descending
      ? {
          priceDecrementCents: 500_000n,
          floorPriceCents: 8_000_000n,
          stepDurationSec: 20,
          switchToAscendingOnAccept: kind === 'desc-switch',
          bidIncrementCents: kind === 'desc-switch' ? 100_000n : null,
        }
      : { bidIncrementCents: 100_000n, endsAt: new Date(startsAt.getTime() + durationSec * 1000) }),
    startsAt,
    registrationDeadline: new Date(now - 1000),
    depositCents: 1_000_000n,
    preemptionEnabled: kind === 'preemption',
    preemptionWindowSec: 120,
  });

  for (const [i, profile] of profiles.entries()) {
    const seq = i + 1;
    await repos.auctionRegistrations.create({
      auctionId: auction.id,
      bidderId: profile.id,
      seq,
      pseudonym: `Dražitelj ${String(seq)}`,
      paymentReference: buildDepositReference(auction.number, seq),
      status: 'APPROVED',
      approvedBy: trusteeUser.id,
      approvedAt: new Date(now),
      depositStatus: 'PAID',
      depositPaidAt: new Date(now),
      depositNote: 'Demo',
      ...(kind === 'preemption' && seq === 2
        ? { isPreemptionHolder: true, preemptionRank: 1 }
        : {}),
    });
  }
  console.log(`Auction ${auction.id} (${kind}) starts at ${startsAt.toISOString()}`);
  console.log(
    `Live page: ${process.env.APP_URL ?? 'http://localhost:3000'}/drazbe/${auction.id}/v-zivo`,
  );
  if (descending) {
    console.log(`Competing bidder (Dražitelj 1): node dist/cli/demo-bot.js ${auction.id} --step 2`);
  }
} finally {
  await handle.close();
}
