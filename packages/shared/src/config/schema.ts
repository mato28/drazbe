import { z } from 'zod';

type Env = Record<string, string | undefined>;

/** Config shared by every server-side process (web + worker). */
export const serverConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  APP_URL: z.url(),

  DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:\/\//.test(v), {
    message: 'DATABASE_URL must be a postgres:// URL',
  }),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1),

  /** EU DSS (signature validation) base URL; REST under /services/rest. */
  DSS_URL: z.url().default('http://localhost:8089'),
  /**
   * Accept only qualified electronic signatures (QES) on sale contracts. Set to false in
   * development only, so contracts signed with test certificates are accepted.
   */
  SIGNATURE_REQUIRE_QUALIFIED: z.stringbool().default(true),
});

export const workerConfigSchema = serverConfigSchema.extend({
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  /** Fallback poll for the notifications outbox (LISTEN/NOTIFY is the primary trigger). */
  WORKER_OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(5000),
  /** Auction clock: how often due transitions (start, price steps, end) are checked. */
  WORKER_AUCTION_TICK_MS: z.coerce.number().int().min(200).max(5000).default(1000),
  /** Post-auction jobs (reports, deadline reminders). */
  WORKER_POST_AUCTION_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

function parse<T extends z.ZodType>(schema: T, env: Env): z.infer<T> {
  // Treat empty strings as unset so `FOO=` in .env falls back to defaults / fails validation.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function loadServerConfig(env: Env = process.env): ServerConfig {
  return parse(serverConfigSchema, env);
}

export function loadWorkerConfig(env: Env = process.env): WorkerConfig {
  return parse(workerConfigSchema, env);
}
