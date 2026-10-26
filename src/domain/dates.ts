/**
 * Calendar dates are plain "YYYY-MM-DD" strings, never timestamps. A trip
 * crosses time zones: a timestamp can land on a different calendar day once
 * the phone changes zone, a date string cannot. Arithmetic goes through UTC
 * midnight so daylight-saving changes never add or drop a day.
 *
 * ISO date strings also sort correctly as plain strings, so `a < b` works.
 */
export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

function parts(date: string): [number, number, number] | null {
  const m = ISO_RE.exec(date);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const p = parts(value);
  if (!p) return false;
  const [y, m, d] = p;
  if (y < 1900 || y > 2999) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function utcMs(date: IsoDate): number {
  const p = parts(date);
  if (!p) throw new Error(`Not a calendar date: ${date}`);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

function fromUtcMs(ms: number): IsoDate {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(utcMs(date) + days * DAY_MS);
}

/** Inclusive: a trip from the 1st to the 30th is 30 days long. */
export function tripLength(start: IsoDate, end: IsoDate): number {
  return daysBetween(start, end) + 1;
}

/** Day 1 is the start date. */
export function dayNumber(start: IsoDate, date: IsoDate): number {
  return daysBetween(start, date) + 1;
}

/** Today on this device's own calendar. */
export function todayIso(now: Date = new Date()): IsoDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function clampDate(date: IsoDate, min: IsoDate, max: IsoDate): IsoDate {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

/** "12 Nov", or "12 Nov 2026" with the year. */
export function formatDate(date: IsoDate, withYear = false): string {
  return new Date(utcMs(date)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
