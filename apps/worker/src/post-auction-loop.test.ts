import { describe, expect, it, vi } from 'vitest';
import { startPostAuctionLoop } from './post-auction-loop';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('post-auction loop', () => {
  it('generates missing reports (one failure does not block others) and sends reminders', async () => {
    const generated: string[] = [];
    let wake: (() => void) | undefined;
    const stop = await startPostAuctionLoop({
      jobs: {
        listAuctionsNeedingReport: () => Promise.resolve(['a', 'b']),
        generateReports: (id) => {
          if (id === 'a') return Promise.reject(new Error('boom'));
          generated.push(id);
          return Promise.resolve({});
        },
        sendReminders: () => Promise.resolve(2),
      },
      intervalMs: 60_000,
      logger,
      subscribe: (onWake) => {
        wake = onWake;
        return Promise.resolve(() => Promise.resolve());
      },
    });
    await vi.waitFor(() => {
      expect(generated).toEqual(['b']);
    });
    wake?.();
    await vi.waitFor(() => {
      expect(generated).toEqual(['b', 'b']);
    });
    await stop();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('auction a: report failed'));
    expect(logger.info).toHaveBeenCalledWith('sale reminders queued: 2');
  });
});
