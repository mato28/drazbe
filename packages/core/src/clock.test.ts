import { describe, expect, it } from 'vitest';
import { FixedClock, systemClock } from './clock';

describe('systemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('FixedClock', () => {
  it('returns a stable time that only moves when advanced', () => {
    const clock = new FixedClock(new Date('2026-01-01T10:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T10:00:00.000Z');

    clock.advance(120_000);
    expect(clock.now().toISOString()).toBe('2026-01-01T10:02:00.000Z');

    clock.set(new Date('2026-02-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('does not leak its internal Date', () => {
    const clock = new FixedClock(new Date('2026-01-01T10:00:00Z'));
    clock.now().setFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
