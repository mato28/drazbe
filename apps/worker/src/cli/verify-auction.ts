/**
 * Re-verifies the bid hash chain of one auction (court evidence).
 *
 *   pnpm verify-auction <auctionId>
 *
 * Exit code 0 = intact, 1 = tampering / inconsistency found, 2 = usage error / not found.
 */
import { verifyAuction } from '@domik/core';
import { createDb, createUnitOfWork } from '@domik/db';

const auctionId = process.argv.slice(2).find((a) => a !== '--');
if (
  !auctionId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auctionId)
) {
  console.error('Usage: pnpm verify-auction <auctionId (uuid)>');
  process.exit(2);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const handle = createDb(databaseUrl, { max: 1 });
try {
  const result = await verifyAuction({ uow: createUnitOfWork(handle.db) }, auctionId);
  if (!result) {
    console.error(`Auction ${auctionId} not found.`);
    process.exitCode = 2;
  } else {
    console.log(`Auction:          ${result.auctionId}`);
    console.log(`Bids:             ${String(result.bidCount)}`);
    console.log(`Head hash:        ${result.headHash}`);
    console.log(`Price consistent: ${result.priceConsistent ? 'yes' : 'NO'}`);
    for (const p of result.problems) console.log(`  ✗ seq ${String(p.seq)}: ${p.problem}`);
    console.log(result.valid ? 'OK: bid chain is intact.' : 'FAILED: bid log does not verify.');
    process.exitCode = result.valid ? 0 : 1;
  }
} finally {
  await handle.close();
}
