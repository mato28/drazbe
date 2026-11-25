import { describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../clock';
import {
  type Mailer,
  type OutboxMessage,
  type OutboxPort,
  processOutboxBatch,
  retryDelayMs,
} from './outbox-processor';

const otp = (id: string, attempts = 1): OutboxMessage => ({
  id,
  template: 'auth.otp',
  recipient: `${id}@test.local`,
  payload: { otp: '123456', type: 'email-verification', expiresInMinutes: 5 },
  attempts,
});

function fakeOutbox(messages: OutboxMessage[]) {
  return {
    claimBatch: vi.fn<OutboxPort['claimBatch']>().mockResolvedValue(messages),
    markSent: vi.fn<OutboxPort['markSent']>().mockResolvedValue(),
    markFailed: vi.fn<OutboxPort['markFailed']>().mockResolvedValue(),
  };
}

describe('processOutboxBatch', () => {
  const clock = new FixedClock(new Date('2026-01-01T12:00:00Z'));

  it('sends each claimed message and marks it sent', async () => {
    const outbox = fakeOutbox([otp('a'), otp('b')]);
    const send = vi.fn<Mailer['send']>().mockResolvedValue();

    const res = await processOutboxBatch({ outbox, mailer: { send }, clock });

    expect(res).toEqual({ sent: 2, retried: 0, failed: 0 });
    expect(send.mock.calls[0]?.[0].to).toBe('a@test.local');
    expect(send.mock.calls[0]?.[0].subject).toContain('Potrditev');
    expect(outbox.markSent).toHaveBeenCalledWith('a', clock.now());
  });

  it('schedules a retry with backoff when sending fails', async () => {
    const outbox = fakeOutbox([otp('a', 2)]);
    const mailer: Mailer = { send: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };

    const res = await processOutboxBatch({ outbox, mailer, clock });

    expect(res).toEqual({ sent: 0, retried: 1, failed: 0 });
    expect(outbox.markFailed).toHaveBeenCalledWith(
      'a',
      'ECONNREFUSED',
      new Date(clock.now().getTime() + 60_000),
    );
  });

  it('fails permanently after maxAttempts', async () => {
    const outbox = fakeOutbox([otp('a', 3)]);
    const mailer: Mailer = { send: vi.fn().mockRejectedValue(new Error('boom')) };

    const res = await processOutboxBatch({ outbox, mailer, clock, maxAttempts: 3 });

    expect(res.failed).toBe(1);
    expect(outbox.markFailed).toHaveBeenCalledWith('a', 'boom', null);
  });

  it('fails permanently (without sending) on an invalid payload', async () => {
    const outbox = fakeOutbox([{ ...otp('a'), payload: {} }]);
    const send = vi.fn<Mailer['send']>();

    const res = await processOutboxBatch({ outbox, mailer: { send }, clock });

    expect(res.failed).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(outbox.markFailed).toHaveBeenCalledWith('a', expect.stringMatching(/^render:/), null);
  });
});

describe('retryDelayMs', () => {
  it('doubles and caps at one hour', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(30)).toBe(3_600_000);
  });
});
