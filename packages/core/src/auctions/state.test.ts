import { AUCTION_STATUSES } from '@domik/shared';
import { describe, expect, it } from 'vitest';
import { canPerform, statusAfter } from './state';

describe('auction lifecycle actions', () => {
  it('publish is only possible from DRAFT', () => {
    expect(AUCTION_STATUSES.filter((s) => canPerform('publish', s))).toEqual(['DRAFT']);
    expect(statusAfter('publish')).toBe('PUBLISHED');
  });

  it('cancel is possible until the auction goes live', () => {
    expect(AUCTION_STATUSES.filter((s) => canPerform('cancel', s))).toEqual([
      'DRAFT',
      'PUBLISHED',
      'REGISTRATION_CLOSED',
    ]);
    expect(statusAfter('cancel')).toBe('CANCELLED');
  });

  it('stop is only possible while the auction is running', () => {
    expect(AUCTION_STATUSES.filter((s) => canPerform('stop', s))).toEqual(['LIVE', 'PREEMPTION']);
    expect(statusAfter('stop')).toBe('CANCELLED');
  });

  it('nothing can be done to a finished auction', () => {
    for (const s of ['ENDED', 'UNSUCCESSFUL', 'CANCELLED'] as const) {
      expect(canPerform('publish', s) || canPerform('cancel', s) || canPerform('stop', s)).toBe(
        false,
      );
    }
  });
});
