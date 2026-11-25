// Better Auth tables (user, session, account, verification) with our extra user fields.
// Field names must match Better Auth's model; `casing: 'snake_case'` maps them to columns.
import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from './_common';
import { userRole } from './enums';

export const users = pgTable('users', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  phone: text(),
  role: userRole().notNull().default('BIDDER'),
  ...timestamps,
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    expiresAt: tstz().notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: tstz(),
    refreshTokenExpiresAt: tstz(),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: tstz().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);
