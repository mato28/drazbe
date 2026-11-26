import 'server-only';
import { apiFailure } from './api';
import { TokenBucketLimiter } from './token-bucket';

/**
 * Per-client request limits for the live-auction endpoints. A person clicking never reaches them;
 * a script polling or firing requests in a loop does. They do not decide who wins (the engine
 * does), they cap how hard one client can hit the server.
 */
const LIMITERS = {
  /** Bids, price acceptances and pre-emption matches, per bidder (one shared budget). */
  bid: new TokenBucketLimiter({ capacity: 5, refillPerSec: 0.5 }),
  /** Live-state reads, per signed-in user or per IP. The live page itself uses the stream. */
  live: new TokenBucketLimiter({ capacity: 10, refillPerSec: 1 }),
} as const;

export type RateLimitName = keyof typeof LIMITERS;

/** Throws a 429 (handled by `handle` / `handlePublic`) when `key` is over the `name` limit. */
export function enforceRateLimit(name: RateLimitName, key: string): void {
  const result = LIMITERS[name].take(key);
  if (result.ok) return;
  // Repeated hits are the signal worth looking at (scripts); there is no PII beyond the key.
  console.warn(`[rate-limit] ${name} limit hit by ${key}`);
  throw apiFailure(
    429,
    'RATE_LIMITED',
    `Preveč zahtev v kratkem času. Poskusite znova čez ${String(result.retryAfterSec)} s.`,
    undefined,
    { 'Retry-After': String(result.retryAfterSec) },
  );
}

/**
 * Client IP for anonymous limits. The app runs behind a reverse proxy (Traefik), which sets
 * X-Forwarded-For; the web container is not reachable directly, so the header can be trusted.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get('x-real-ip')?.trim();
  return realIp ? realIp : 'unknown';
}
