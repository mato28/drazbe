import { relations } from 'drizzle-orm';
import { accounts, sessions, users } from './auth';
import {
  auctionRegistrations,
  auctions,
  bidderProfiles,
  insolvencyCases,
  lots,
  trustees,
} from './domain';
import { bids } from './ledger';

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  trustee: one(trustees),
  bidderProfile: one(bidderProfiles),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const trusteesRelations = relations(trustees, ({ one, many }) => ({
  user: one(users, { fields: [trustees.userId], references: [users.id] }),
  cases: many(insolvencyCases),
}));

export const insolvencyCasesRelations = relations(insolvencyCases, ({ one, many }) => ({
  trustee: one(trustees, { fields: [insolvencyCases.trusteeId], references: [trustees.id] }),
  lots: many(lots),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  case: one(insolvencyCases, { fields: [lots.caseId], references: [insolvencyCases.id] }),
  auctions: many(auctions),
}));

export const auctionsRelations = relations(auctions, ({ one, many }) => ({
  lot: one(lots, { fields: [auctions.lotId], references: [lots.id] }),
  winner: one(bidderProfiles, {
    fields: [auctions.winnerBidderId],
    references: [bidderProfiles.id],
  }),
  registrations: many(auctionRegistrations),
  bids: many(bids),
}));

export const bidderProfilesRelations = relations(bidderProfiles, ({ one, many }) => ({
  user: one(users, { fields: [bidderProfiles.userId], references: [users.id] }),
  registrations: many(auctionRegistrations),
}));

export const auctionRegistrationsRelations = relations(auctionRegistrations, ({ one, many }) => ({
  auction: one(auctions, { fields: [auctionRegistrations.auctionId], references: [auctions.id] }),
  bidder: one(bidderProfiles, {
    fields: [auctionRegistrations.bidderId],
    references: [bidderProfiles.id],
  }),
  bids: many(bids),
}));

export const bidsRelations = relations(bids, ({ one }) => ({
  auction: one(auctions, { fields: [bids.auctionId], references: [auctions.id] }),
  registration: one(auctionRegistrations, {
    fields: [bids.registrationId],
    references: [auctionRegistrations.id],
  }),
}));
