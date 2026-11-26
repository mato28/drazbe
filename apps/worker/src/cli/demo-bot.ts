/**
 * DEVELOPMENT / STAGING ONLY: a scripted competing bidder for client demos of DESCENDING auctions.
 *
 * Plays one seeded bidder (default drazitelj1@domik.local) through the normal bidding engine, the
 * same calls the web API makes: bids are checked by the usual rules, recorded in order of arrival
 * and hash-chained like any other bid. The bot never reorders or back-dates anything; if the
 * human bidder accepts first, the human wins.
 *
 *   node dist/cli/demo-bot.js <auctionId> [--step 2] [--delay 800] [--max 120000] [--as <email>]
 *
 *   --step   accept the price as soon as this price level starts (0 = starting price; default 2)
 *   --delay  milliseconds to wait after the level starts before accepting (default 800)
 *   --max    desc-switch only: outbid in the ascending continuation up to this price in EUR
 *            (default: no limit)
 *   --as     email of the seeded bidder the bot plays (default drazitelj1@domik.local)
 *
 * Only runs against auctions created by `demo-auction` (court approval ref "Demo").
 */
import { randomUUID } from 'node:crypto';
import {
  biddingService,
  DomainError,
  descendingStepAt,
  isAscendingMode,
  minimumBid,
  systemClock,
  type Actor,
} from '@domik/core';
import { createDb, createRepositories, createUnitOfWork } from '@domik/db';
import { formatCents } from '@domik/shared';

const USAGE =
  'Usage: demo-bot <auctionId> [--step N] [--delay ms] [--max EUR] [--as email@domik.local]';
const POLL_MS = 250;

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_DATA !== 'true') {
  console.error(
    'Refusing to run the demo bot in production (set ALLOW_DEMO_DATA=true on staging).',
  );
  process.exit(2);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const args = argv.filter((a) => a !== '--');
  const auctionId = args[0];
  const flags = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith('--') || value === undefined) return null;
    flags.set(key.slice(2), value);
  }
  const step = Number(flags.get('step') ?? 2);
  const delayMs = Number(flags.get('delay') ?? 800);
  const maxEur = flags.has('max') ? Number(flags.get('max')) : null;
  if (
    !auctionId ||
    !Number.isInteger(step) ||
    step < 0 ||
    !Number.isInteger(delayMs) ||
    delayMs < 0 ||
    (maxEur !== null && !(maxEur > 0))
  ) {
    return null;
  }
  return {
    auctionId,
    step,
    delayMs,
    maxCents: maxEur === null ? null : BigInt(Math.round(maxEur * 100)),
    email: flags.get('as') ?? 'drazitelj1@domik.local',
  };
}

const opts = parseArgs(process.argv.slice(2));
if (!opts) {
  console.error(USAGE);
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string): void => {
  console.log(`${new Date().toISOString().slice(11, 19)}  ${msg}`);
};

const handle = createDb(databaseUrl, { max: 2 });
try {
  const repos = createRepositories(handle.db);
  const ctx = {
    uow: createUnitOfWork(handle.db),
    clock: systemClock,
    appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  };

  const auction = await repos.auctions.findById(opts.auctionId);
  if (!auction) throw new Error(`Auction ${opts.auctionId} not found.`);
  if (auction.courtApprovalRef !== 'Demo') {
    throw new Error('The bot only plays auctions created by demo-auction.');
  }
  if (auction.type !== 'DESCENDING') {
    throw new Error('The bot plays DESCENDING auctions (demo-auction desc | desc-switch).');
  }
  const user = await repos.users.findByEmail(opts.email);
  const profile = user && (await repos.bidderProfiles.findByUserId(user.id));
  const registration =
    profile && (await repos.auctionRegistrations.findByAuctionAndBidder(auction.id, profile.id));
  if (!user || !registration) {
    throw new Error(`${opts.email} is not registered for this auction.`);
  }
  const actor: Actor = { userId: user.id, role: 'BIDDER' };
  const me = registration.pseudonym;

  log(
    `Bot plays ${me} (${opts.email}); accepts at price level ${String(opts.step)} ` +
      `after ${String(opts.delayMs)} ms` +
      (auction.switchToAscendingOnAccept
        ? `, then outbids up to ${opts.maxCents === null ? 'no limit' : formatCents(opts.maxCents)}`
        : ''),
  );

  let waitingLogged = false;
  for (;;) {
    const a = await repos.auctions.findById(auction.id);
    if (!a) throw new Error('Auction disappeared.');

    if (a.status === 'PUBLISHED' || a.status === 'REGISTRATION_CLOSED') {
      if (!waitingLogged) log(`Waiting for the start at ${a.startsAt.toISOString()} …`);
      waitingLogged = true;
      await sleep(POLL_MS);
      continue;
    }
    if (a.status !== 'LIVE') {
      const leader = a.leadingRegistrationId === registration.id ? me : 'the other bidder';
      log(
        `Auction is ${a.status}` +
          (a.currentPriceCents === null || a.status === 'UNSUCCESSFUL'
            ? '.'
            : `, leader: ${leader} at ${formatCents(a.currentPriceCents)}.`),
      );
      break;
    }

    try {
      if (!isAscendingMode(a)) {
        // Descending phase: accept as soon as our price level has been running for `delay`.
        const level = descendingStepAt(a, new Date());
        const levelStartedAt = level.stepEndsAt.getTime() - (a.stepDurationSec ?? 0) * 1000;
        const targetReached = level.step >= opts.step || level.isLast;
        if (!level.expired && targetReached && Date.now() - levelStartedAt >= opts.delayMs) {
          await biddingService.acceptCurrentPrice(ctx, actor, a.id, {
            expectedPriceCents: level.priceCents,
            idempotencyKey: randomUUID(),
          });
          log(`${me} accepted ${formatCents(level.priceCents)}.`);
        }
      } else if (a.leadingRegistrationId !== registration.id) {
        // Continued as ascending (desc-switch): answer the other bidder's bid.
        const amount = minimumBid(a);
        if (opts.maxCents === null || amount <= opts.maxCents) {
          await sleep(opts.delayMs);
          await biddingService.placeBid(ctx, actor, a.id, {
            amountCents: amount,
            idempotencyKey: randomUUID(),
          });
          log(`${me} bid ${formatCents(amount)}.`);
        }
      }
    } catch (e) {
      // Lost a race (the other bidder was first, the price just changed, the clock ended it):
      // the engine refused, which is the honest outcome. Re-read the auction and carry on.
      if (!(e instanceof DomainError)) throw e;
      log(`Engine refused: ${e.message}`);
    }
    await sleep(POLL_MS);
  }
} finally {
  await handle.close();
}
