import { FixedClock, type OutboxMessage, type OutboxPort } from '@domik/core';
import { describe, expect, it, vi } from 'vitest';
import { startOutboxLoop } from './outbox-loop';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const message: OutboxMessage = {
  id: 'm1',
  template: 'auth.otp',
  recipient: 'a@test.local',
  payload: { otp: '123456', type: 'email-verification', expiresInMinutes: 5 },
  attempts: 1,
};

describe('startOutboxLoop', () => {
  it('delivers on start and again when woken by NOTIFY', async () => {
    const claimBatch = vi
      .fn<OutboxPort['claimBatch']>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([message])
      .mockResolvedValue([]);
    const markSent = vi.fn<OutboxPort['markSent']>().mockResolvedValue();
    const outbox: OutboxPort = { claimBatch, markSent, markFailed: vi.fn() };
    const send = vi.fn().mockResolvedValue(undefined);
    let wake: () => void = () => undefined;

    const stop = await startOutboxLoop({
      outbox,
      mailer: { send },
      clock: new FixedClock(new Date()),
      logger,
      pollIntervalMs: 60_000,
      subscribe: (onWake) => {
        wake = onWake;
        return Promise.resolve(() => Promise.resolve());
      },
    });

    await vi.waitFor(() => {
      expect(claimBatch).toHaveBeenCalledTimes(1);
    });
    wake();
    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@test.local' }));
    });
    expect(markSent).toHaveBeenCalledWith('m1', expect.any(Date));
    await stop();
  });
});
