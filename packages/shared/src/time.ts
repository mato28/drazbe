import { DISPLAY_TIME_ZONE, LOCALE } from './constants';

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Wall-clock time in Europe/Ljubljana for a UTC instant. */
export function toWallTime(date: Date): WallTime {
  const p: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const year = p.year ?? 0;
  const month = p.month ?? 1;
  const day = p.day ?? 1;
  return {
    year,
    month,
    day,
    hour: p.hour ?? 0,
    minute: p.minute ?? 0,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** UTC instant for a Europe/Ljubljana wall-clock time (DST-aware). */
export function fromWallTime(w: Omit<WallTime, 'weekday'>): Date {
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  // Offset = (wall time read as UTC) - (actual instant). Two passes settle DST edges.
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const g = toWallTime(new Date(guess));
    const offset = Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute) - guess;
    guess = asUtc - offset;
  }
  return new Date(guess);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Value for `<input type="datetime-local">`, in Europe/Ljubljana. */
export function toDateTimeLocal(date: Date): string {
  const w = toWallTime(date);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Parses a `datetime-local` value as Europe/Ljubljana wall time. Null if malformed. */
export function fromDateTimeLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return fromWallTime({ year, month, day, hour, minute });
}

const displayFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** e.g. "10. 1. 2030, 10:00" (Europe/Ljubljana). */
export function formatDateTime(date: Date | string): string {
  return displayFormatter.format(typeof date === 'string' ? new Date(date) : date);
}
