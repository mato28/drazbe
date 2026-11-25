import { FixedClock } from '@domik/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat } from './heartbeat';

describe('startHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('beats immediately and then on every interval until stopped', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const log = vi.fn<(message: string) => void>();
    const stop = startHeartbeat({ intervalMs: 5000, clock, log });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('heartbeat #1');

    clock.advance(5000);
    vi.advanceTimersByTime(5000);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1]?.[0]).toContain('uptime 5s');

    clock.advance(10_000);
    vi.advanceTimersByTime(10_000);
    expect(log).toHaveBeenCalledTimes(4);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(log).toHaveBeenCalledTimes(4);
  });
});
