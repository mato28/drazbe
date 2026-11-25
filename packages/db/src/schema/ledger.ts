// Append-only tables (court evidence). UPDATE/DELETE/TRUNCATE are blocked by triggers,
// see drizzle/*_append_only_triggers.sql.
import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
  bigserial,
} from 'drizzle-orm/pg-core';
import { cents, id, tstz } from './_common';
import { users } from './auth';
import { auctionRegistrations, auctions } from './domain';
import { bidKind, notificationChannel, notificationStatus } from './enums';

export const bids = pgTable(
  'bids',
  {
    id: id(),
    auctionId: uuid()
      .notNull()
      .references(() => auctions.id, { onDelete: 'restrict' }),
    registrationId: uuid()
      .notNull()
      .references(() => auctionRegistrations.id, { onDelete: 'restrict' }),
    /** 1-based, gapless per auction. */
    seq: integer().notNull(),
    amountCents: cents().notNull(),
    kind: bidKind().notNull().default('BID'),
    /** Server time at placement — the only authoritative time. */
    serverTime: tstz().notNull().defaultNow(),
    /** sha256 hex of the previous bid (genesis: sha256(auctionId)). */
    prevHash: char({ length: 64 }).notNull(),
    /** sha256(prevHash | auctionId | bidderPseudonym | amountCents | serverTimeISO | seq) */
    hash: char({ length: 64 }).notNull().unique(),
    /** RFC 3161 timestamp token (base64), filled asynchronously by the worker exactly once. */
    tsaToken: text(),
    /** Client-generated key; a repeated submit with the same key returns the original bid. */
    idempotencyKey: uuid(),
  },
  (t) => [
    unique('bids_auction_seq_unique').on(t.auctionId, t.seq),
    unique('bids_registration_idempotency_unique').on(t.registrationId, t.idempotencyKey),
    index().on(t.registrationId),
    check('bids_seq_positive', sql`${t.seq} > 0`),
    check('bids_amount_positive', sql`${t.amountCents} > 0`),
    check('bids_hash_hex', sql`${t.hash} ~ '^[0-9a-f]{64}$' AND ${t.prevHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey(),
    /** NULL = system / worker. */
    actorId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    entity: text().notNull(),
    entityId: text().notNull(),
    action: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    at: tstz().notNull().defaultNow(),
  },
  (t) => [index().on(t.entity, t.entityId), index().on(t.actorId)],
);

/** Transactional outbox: rows are inserted with the business change, the worker delivers them. */
export const notificationsOutbox = pgTable(
  'notifications_outbox',
  {
    id: id(),
    channel: notificationChannel().notNull().default('EMAIL'),
    template: text().notNull(),
    recipient: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: notificationStatus().notNull().default('PENDING'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    /** Do not deliver before this time (retry backoff / scheduled sends). */
    availableAt: tstz().notNull().defaultNow(),
    /** Optional idempotency key; a duplicate enqueue is ignored. */
    dedupeKey: text().unique('notifications_outbox_dedupe_key_unique'),
    sentAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.status, t.availableAt)],
);
