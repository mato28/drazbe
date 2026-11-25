// Post-sale record of an auction that ended with a winner.
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { cents, id, timestamps, tstz } from './_common';
import { users } from './auth';
import { auctionRegistrations, auctions, documents } from './domain';
import { saleStatus } from './enums';

export const sales = pgTable(
  'sales',
  {
    id: id(),
    auctionId: uuid()
      .notNull()
      .unique('sales_auction_unique')
      .references(() => auctions.id, { onDelete: 'restrict' }),
    /** The winner (kupec). */
    buyerRegistrationId: uuid()
      .notNull()
      .references(() => auctionRegistrations.id, { onDelete: 'restrict' }),
    status: saleStatus().notNull().default('AWAITING_CONTRACT'),
    priceCents: cents().notNull(),
    /** The winner's deposit, credited towards the price. */
    depositAppliedCents: cents().notNull(),
    /** Due after signing (deposit counts towards it). 0 = no separate down payment. */
    downPaymentCents: cents().notNull(),
    /** Down payment due this many days after the contract is signed. */
    downPaymentDays: integer().notNull(),
    /** Remaining price due this many days after the contract is signed. */
    priceDays: integer().notNull(),

    contractDeadline: tstz().notNull(),
    downPaymentDeadline: tstz(),
    priceDeadline: tstz(),

    contractDocId: uuid().references(() => documents.id, { onDelete: 'restrict' }),
    buyerSignedDocId: uuid().references(() => documents.id, { onDelete: 'restrict' }),
    /** Result of the buyer's signature check (signature validation report summary). */
    buyerSignatureCheck: jsonb(),
    signedDocId: uuid().references(() => documents.id, { onDelete: 'restrict' }),
    signedCheck: jsonb(),
    signedOnPaper: boolean().notNull().default(false),

    contractSignedAt: tstz(),
    downPaymentPaidAt: tstz(),
    pricePaidAt: tstz(),
    transferProposedAt: tstz(),
    transferOrderIssuedAt: tstz(),
    /** Opravilna številka of the court's sklep o izročitvi. */
    transferOrderRef: text(),
    registeredAt: tstz(),
    /** Land registry (ZK) reference (Dn number). */
    registrationRef: text(),
    defaultedAt: tstz(),
    defaultReason: text(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index().on(t.status),
    check('sales_amounts', sql`${t.priceCents} > 0 AND ${t.depositAppliedCents} >= 0 AND ${t.downPaymentCents} >= 0`),
  ],
);
