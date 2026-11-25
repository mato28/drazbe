import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  fromDateTimeLocal,
  fromWallTime,
  toDateTimeLocal,
  toWallTime,
} from './time';

describe('Europe/Ljubljana wall time', () => {
  it('converts winter time (UTC+1)', () => {
    const d = new Date('2030-01-10T09:00:00Z');
    expect(toDateTimeLocal(d)).toBe('2030-01-10T10:00');
    expect(fromDateTimeLocal('2030-01-10T10:00')?.toISOString()).toBe('2030-01-10T09:00:00.000Z');
  });

  it('converts summer time (UTC+2)', () => {
    const d = new Date('2030-07-10T08:00:00Z');
    expect(toDateTimeLocal(d)).toBe('2030-07-10T10:00');
    expect(fromDateTimeLocal('2030-07-10T10:00')?.toISOString()).toBe('2030-07-10T08:00:00.000Z');
  });

  it('handles the days around DST switches', () => {
    // 2030-03-31 02:00 -> 03:00 (spring forward), 2030-10-27 03:00 -> 02:00 (fall back)
    expect(fromWallTime({ year: 2030, month: 3, day: 31, hour: 12, minute: 0 }).toISOString()).toBe(
      '2030-03-31T10:00:00.000Z',
    );
    expect(
      fromWallTime({ year: 2030, month: 10, day: 27, hour: 12, minute: 0 }).toISOString(),
    ).toBe('2030-10-27T11:00:00.000Z');
  });

  it('reports the local weekday', () => {
    // 2030-01-06 23:30 UTC is already Monday 00:30 in Ljubljana.
    expect(toWallTime(new Date('2030-01-06T23:30:00Z')).weekday).toBe(1);
  });

  it('rejects malformed input', () => {
    expect(fromDateTimeLocal('10.1.2030 10:00')).toBeNull();
    expect(fromDateTimeLocal('2030-13-01T10:00')).toBeNull();
  });

  it('formats for display in Slovenian', () => {
    expect(formatDateTime(new Date('2030-01-10T09:00:00Z'))).toMatch(/10\. 1\. 2030.*10:00/);
  });
});
