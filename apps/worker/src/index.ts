import {
  AUCTION_EVENTS_CHANNEL,
  auctionsRepository,
  createDb,
  createUnitOfWork,
  notificationsOutboxRepository,
  parseAuctionEvent,
} from '@domik/db';
import { auctionClock, generateAuctionReports, runSaleReminders, systemClock } from '@domik/core';
import { renderDocumentPdf } from '@domik/pdf';
import { createS3Storage } from '@domik/storage';
import { loadWorkerConfig } from '@domik/shared/config';
import { startHeartbeat } from './heartbeat';
import { startAuctionClockLoop } from './auction-clock-loop';
import { createLogger } from './logger';
import { createSmtpMailer } from './mailer';
import { startOutboxLoop } from './outbox-loop';
import { startPostAuctionLoop } from './post-auction-loop';

const config = loadWorkerConfig();
const logger = createLogger('worker', config.LOG_LEVEL);

logger.info(
  `starting (env=${config.NODE_ENV}, heartbeat=${config.WORKER_HEARTBEAT_INTERVAL_MS}ms)`,
);

const dbHandle = createDb(config.DATABASE_URL, { max: 5 });
const mailer = createSmtpMailer(config);

const stopHeartbeat = startHeartbeat({
  intervalMs: config.WORKER_HEARTBEAT_INTERVAL_MS,
  clock: systemClock,
  log: logger.info,
});

const stopOutbox = await startOutboxLoop({
  outbox: notificationsOutboxRepository(dbHandle.db),
  mailer,
  clock: systemClock,
  logger,
  pollIntervalMs: config.WORKER_OUTBOX_POLL_INTERVAL_MS,
  subscribe: (onWake) => dbHandle.listen('notifications_outbox', onWake),
});
logger.info('outbox delivery started');

const appUrl = config.APP_URL.replace(/\/$/, '');
const clockCtx = { uow: createUnitOfWork(dbHandle.db), clock: systemClock, appUrl };
const stopAuctionClock = startAuctionClockLoop({
  tick: () => auctionClock.runClockTick(clockCtx),
  intervalMs: config.WORKER_AUCTION_TICK_MS,
  logger,
});
logger.info(`auction clock started (tick=${String(config.WORKER_AUCTION_TICK_MS)}ms)`);

const storage = createS3Storage({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
});
const reportCtx = { ...clockCtx, storage, pdf: { render: renderDocumentPdf } };
const stopPostAuction = await startPostAuctionLoop({
  jobs: {
    listAuctionsNeedingReport: () => auctionsRepository(dbHandle.db).listIdsNeedingReport(),
    generateReports: (auctionId) => generateAuctionReports(reportCtx, auctionId),
    sendReminders: () => runSaleReminders(clockCtx),
  },
  intervalMs: config.WORKER_POST_AUCTION_INTERVAL_MS,
  logger,
  // Closing an auction publishes an event: generate its report right away.
  subscribe: (onWake) =>
    dbHandle.listen(AUCTION_EVENTS_CHANNEL, (payload) => {
      // Status changes only (the clock publishes the transition name); bids are frequent.
      const type = parseAuctionEvent(payload)?.type;
      if (type && type !== 'bid' && type !== 'price_step') onWake();
    }),
});
logger.info('post-auction jobs started (reports, sale reminders)');

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`received ${signal}, shutting down`);
  stopHeartbeat();
  await stopAuctionClock();
  await stopPostAuction();
  await stopOutbox();
  mailer.close();
  await dbHandle.close();
  process.exit(0);
}

process.on('SIGINT', (s) => void shutdown(s));
process.on('SIGTERM', (s) => void shutdown(s));
