import { type Database, type Executor, type Transaction } from '../client';
import { auctionEventsRepository } from './auction-events';
import { auctionRegistrationsRepository } from './auction-registrations';
import { auctionsRepository } from './auctions';
import { auditLogRepository } from './audit-log';
import { bidderProfilesRepository } from './bidder-profiles';
import { bidsRepository } from './bids';
import { documentsRepository } from './documents';
import { insolvencyCasesRepository } from './insolvency-cases';
import { locksRepository } from './locks';
import { lotsRepository } from './lots';
import { notificationsOutboxRepository } from './notifications-outbox';
import { publicAuctionsRepository } from './public-auctions';
import { salesRepository } from './sales';
import { trusteesRepository } from './trustees';
import { usersRepository } from './users';

export function createRepositories(db: Executor) {
  return {
    users: usersRepository(db),
    trustees: trusteesRepository(db),
    insolvencyCases: insolvencyCasesRepository(db),
    lots: lotsRepository(db),
    documents: documentsRepository(db),
    auctions: auctionsRepository(db),
    bidderProfiles: bidderProfilesRepository(db),
    auctionRegistrations: auctionRegistrationsRepository(db),
    bids: bidsRepository(db),
    auditLog: auditLogRepository(db),
    notificationsOutbox: notificationsOutboxRepository(db),
    publicAuctions: publicAuctionsRepository(db),
    auctionEvents: auctionEventsRepository(db),
    locks: locksRepository(db),
    sales: salesRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

/** Run `fn` in one transaction with repositories bound to it. */
export function withTransaction<T>(
  db: Database,
  fn: (repos: Repositories, tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) => fn(createRepositories(tx), tx));
}

/** What core services receive: repositories + a way to run several of them atomically. */
export interface UnitOfWork {
  repos: Repositories;
  transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}

export function createUnitOfWork(db: Database): UnitOfWork {
  return {
    repos: createRepositories(db),
    transaction: (fn) => withTransaction(db, (repos) => fn(repos)),
  };
}

export * from './auction-events';
export * from './auction-registrations';
export * from './auctions';
export * from './audit-log';
export * from './bidder-profiles';
export * from './bids';
export * from './documents';
export * from './insolvency-cases';
export * from './locks';
export * from './lots';
export * from './notifications-outbox';
export * from './public-auctions';
export * from './sales';
export * from './trustees';
export * from './users';
