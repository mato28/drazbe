/**
 * In-memory token bucket per key: `capacity` requests at once, then `refillPerSec` sustained.
 * Process-local on purpose: the web app runs as a single instance. With several instances this
 * must move to shared storage (Postgres), or the limits multiply by the instance count.
 */
export interface TokenBucketOptions {
  capacity: number;
  refillPerSec: number;
  /** Idle buckets are dropped once there are more keys than this. */
  maxKeys?: number;
  now?: () => number;
}

export type TakeResult = { ok: true } | { ok: false; retryAfterSec: number };

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(opts: TokenBucketOptions) {
    if (opts.capacity < 1 || opts.refillPerSec <= 0) throw new Error('invalid rate limit');
    this.capacity = opts.capacity;
    this.refillPerMs = opts.refillPerSec / 1000;
    this.maxKeys = opts.maxKeys ?? 10_000;
    this.now = opts.now ?? Date.now;
  }

  /** Consumes one token for `key` if available. */
  take(key: string): TakeResult {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens = Math.min(
        this.capacity,
        bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs,
      );
      bucket.updatedAt = now;
    } else {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      bucket = { tokens: this.capacity, updatedAt: now };
      this.buckets.set(key, bucket);
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterSec: Math.ceil((1 - bucket.tokens) / this.refillPerMs / 1000) };
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Drops buckets that would be full again by now (they behave exactly like a new key). */
  private sweep(now: number): void {
    for (const [key, b] of this.buckets) {
      if (b.tokens + (now - b.updatedAt) * this.refillPerMs >= this.capacity) {
        this.buckets.delete(key);
      }
    }
  }
}
