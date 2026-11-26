import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from './token-bucket';

function limiter(capacity: number, refillPerSec: number, maxKeys?: number) {
  let t = 0;
  const l = new TokenBucketLimiter({
    capacity,
    refillPerSec,
    now: () => t,
    ...(maxKeys ? { maxKeys } : {}),
  });
  return {
    l,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('TokenBucketLimiter', () => {
  it('allows a burst up to capacity, then refuses with a retry hint', () => {
    const { l } = limiter(3, 0.5);
    expect([l.take('a'), l.take('a'), l.take('a')].every((r) => r.ok)).toBe(true);
    expect(l.take('a')).toEqual({ ok: false, retryAfterSec: 2 });
  });

  it('refills over time, never above capacity', () => {
    const { l, advance } = limiter(2, 1);
    l.take('a');
    l.take('a');
    expect(l.take('a').ok).toBe(false);
    advance(1000);
    expect(l.take('a').ok).toBe(true);
    expect(l.take('a').ok).toBe(false);
    advance(60_000);
    expect(l.take('a').ok).toBe(true);
    expect(l.take('a').ok).toBe(true);
    expect(l.take('a').ok).toBe(false);
  });

  it('keeps keys independent', () => {
    const { l } = limiter(1, 1);
    expect(l.take('a').ok).toBe(true);
    expect(l.take('a').ok).toBe(false);
    expect(l.take('b').ok).toBe(true);
  });

  it('a script polling 10x per second is held to the sustained rate', () => {
    const { l, advance } = limiter(10, 1);
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      if (l.take('script').ok) allowed++;
      advance(100);
    }
    // 10 s of polling: the burst of 10 plus ~1 per second.
    expect(allowed).toBeGreaterThanOrEqual(19);
    expect(allowed).toBeLessThanOrEqual(21);
  });

  it('drops idle buckets when the key limit is reached', () => {
    const { l, advance } = limiter(2, 1, 2);
    l.take('a');
    l.take('b');
    advance(5000);
    l.take('c');
    expect(l.size).toBe(1);
  });
});
