import { fromWallTime, toWallTime } from '@domik/shared';

/** Easter Sunday (Gregorian), as [month, day]. */
function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** Fixed-date Slovenian work-free days (dela prosti dnevi), as "M-D". */
const FIXED_HOLIDAYS = new Set([
  '1-1', // novo leto
  '1-2', // novo leto
  '2-8', // Prešernov dan
  '4-27', // dan upora proti okupatorju
  '5-1', // praznik dela
  '5-2', // praznik dela
  '6-25', // dan državnosti
  '8-15', // Marijino vnebovzetje
  '10-31', // dan reformacije
  '11-1', // dan spomina na mrtve
  '12-25', // božič
  '12-26', // dan samostojnosti in enotnosti
]);

/** Is the given calendar date (Europe/Ljubljana) a Slovenian work-free day? */
export function isSlovenianHoliday(year: number, month: number, day: number): boolean {
  if (FIXED_HOLIDAYS.has(`${month}-${day}`)) return true;
  // Easter Monday (Easter Sunday and Pentecost always fall on a Sunday).
  const [em, ed] = easterSunday(year);
  const monday = new Date(Date.UTC(year, em - 1, ed + 1));
  return monday.getUTCMonth() + 1 === month && monday.getUTCDate() === day;
}

export function isWorkingDay(year: number, month: number, day: number): boolean {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isSlovenianHoliday(year, month, day);
}

/**
 * The instant `n` working days before `date`, at the same Europe/Ljubljana wall-clock time.
 * Weekends and Slovenian work-free days are skipped.
 */
export function subtractWorkingDays(date: Date, n: number): Date {
  const wall = toWallTime(date);
  const cursor = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  let remaining = n;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (isWorkingDay(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())) {
      remaining -= 1;
    }
  }
  return fromWallTime({
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
  });
}
