import { describe, expect, it } from 'vitest';
import { isSlovenianHoliday, isWorkingDay, subtractWorkingDays } from './working-days';

describe('Slovenian work-free days', () => {
  it('knows fixed holidays', () => {
    expect(isSlovenianHoliday(2026, 2, 8)).toBe(true);
    expect(isSlovenianHoliday(2026, 6, 25)).toBe(true);
    expect(isSlovenianHoliday(2026, 12, 26)).toBe(true);
    expect(isSlovenianHoliday(2026, 3, 10)).toBe(false);
  });

  it.each([
    [2025, 4, 21],
    [2026, 4, 6],
    [2027, 3, 29],
    [2030, 4, 22],
  ])('knows Easter Monday %i-%i-%i', (y, m, d) => {
    expect(isSlovenianHoliday(y, m, d)).toBe(true);
  });

  it('treats weekends and holidays as non-working', () => {
    expect(isWorkingDay(2026, 11, 14)).toBe(false); // Saturday
    expect(isWorkingDay(2026, 11, 15)).toBe(false); // Sunday
    expect(isWorkingDay(2026, 11, 16)).toBe(true); // Monday
    expect(isWorkingDay(2026, 5, 1)).toBe(false); // Friday, praznik dela
  });
});

describe('subtractWorkingDays', () => {
  it('goes back two working days mid-week, keeping local time', () => {
    // Thursday 2030-01-10 10:00 Ljubljana -> Tuesday 2030-01-08 10:00
    expect(subtractWorkingDays(new Date('2030-01-10T09:00:00Z'), 2).toISOString()).toBe(
      '2030-01-08T09:00:00.000Z',
    );
  });

  it('skips the weekend', () => {
    // Monday 2030-01-14 -> Thursday 2030-01-10
    expect(subtractWorkingDays(new Date('2030-01-14T09:00:00Z'), 2).toISOString()).toBe(
      '2030-01-10T09:00:00.000Z',
    );
  });

  it('skips holidays', () => {
    // Monday 2030-05-06: Fri 3.5. counts, Thu 2.5. and Wed 1.5. are holidays -> Tue 30.4.
    expect(subtractWorkingDays(new Date('2030-05-06T08:00:00Z'), 2).toISOString()).toBe(
      '2030-04-30T08:00:00.000Z',
    );
  });

  it('keeps wall-clock time across a DST change', () => {
    // Tuesday 2030-04-02 10:00 CEST (08:00Z) -> Friday 2030-03-29 10:00 CET (09:00Z)
    expect(subtractWorkingDays(new Date('2030-04-02T08:00:00Z'), 2).toISOString()).toBe(
      '2030-03-29T09:00:00.000Z',
    );
  });
});
