import 'server-only';
import { schema } from '@domik/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { serverConfig } from './config';
import { dbHandle, repositories } from './db';

const OTP_EXPIRES_IN_SEC = 10 * 60;

function createAuth() {
  const config = serverConfig();
  return betterAuth({
    appName: 'Domik',
    baseURL: config.APP_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(dbHandle().db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    advanced: {
      database: { generateId: 'uuid' },
    },
    user: {
      additionalFields: {
        // Never settable by the client: self-registration always yields a BIDDER.
        role: { type: 'string', required: false, defaultValue: 'BIDDER', input: false },
        phone: { type: 'string', required: false, input: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    session: {
      // Signed cookie with the session + user (incl. role) for cheap optimistic checks in proxy.ts.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        otpLength: 6,
        expiresIn: OTP_EXPIRES_IN_SEC,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        // Enqueued in the outbox; the worker delivers it (no SMTP latency in the request).
        async sendVerificationOTP({ email, otp, type }) {
          await repositories().notificationsOutbox.enqueue({
            template: 'auth.otp',
            recipient: email,
            payload: { otp, type, expiresInMinutes: OTP_EXPIRES_IN_SEC / 60 },
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __domikAuth?: Auth };

export function auth(): Auth {
  globalForAuth.__domikAuth ??= createAuth();
  return globalForAuth.__domikAuth;
}
