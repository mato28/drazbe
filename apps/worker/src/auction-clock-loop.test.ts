import { type ClockOutcome } from '@domik/core';
import { describe, expect, it, vi } from 'vitest';
import { startAuctionClockLoop } from './auction-clock-loop';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('startAuctionClockLoop', () => {
  it('ticks repeatedly, logs transitions and survives errors', async () => {
    const outcome: ClockOutcome = {
      auctionId: 'a1',
      skipped: false,
      actions: ['started'],
      status: 'LIVE',
    };
    const tick = vi
      .fn<() => Promise<ClockOutcome[]>>()
      .mockResolvedValueOnce([outcome])
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue([]);
    const stop = startAuctionClockLoop({ tick, intervalMs: 5, logger });
    await vi.waitFor(() => {
      expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    await stop();
    expect(logger.info).toHaveBeenCalledWith('auction a1: started -> LIVE');
    expect(logger.error).toHaveBeenCalledWith('auction clock: db down');
  });

  it('never runs two ticks at once and stops cleanly', async () => {
    let running = 0;
    let maxRunning = 0;
    const tick = vi.fn(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 15));
      running--;
      return [];
    });
    const stop = startAuctionClockLoop({ tick, intervalMs: 1, logger });
    await vi.waitFor(() => {
      expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    await stop();
    const calls = tick.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(tick.mock.calls.length).toBe(calls);
    expect(maxRunning).toBe(1);
  });
});
