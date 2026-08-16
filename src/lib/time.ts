import { DateTime, Interval } from "luxon";

/**
 * Time handling.
 *
 * Every instant is stored in Postgres as timestamptz (UTC). Venues carry their
 * own IANA timezone (Africa/Johannesburg throughout, but modelled per venue so
 * the platform remains correct if operations ever extend beyond SAST).
 *
 * Customers always reason in venue-local wall-clock time, so conversion happens
 * at the edges: parse local -> UTC on the way in, UTC -> local on the way out.
 */

export const DEFAULT_TZ = "Africa/Johannesburg";

/** Convert a venue-local wall-clock date+time into a UTC instant. */
export function localToUtc(
  date: string, // "2026-09-01"
  minutesFromMidnight: number,
  timezone: string,
): Date {
  const dt = DateTime.fromISO(date, { zone: timezone }).startOf("day").plus({
    minutes: minutesFromMidnight,
  });
  if (!dt.isValid) {
    throw new Error(`Invalid local date: ${date} (${timezone})`);
  }
  return dt.toUTC().toJSDate();
}

/** Start of a venue-local day, as a UTC instant. */
export function startOfLocalDay(date: string, timezone: string): Date {
  return localToUtc(date, 0, timezone);
}

/** Start of the following venue-local day, as a UTC instant. */
export function endOfLocalDay(date: string, timezone: string): Date {
  const dt = DateTime.fromISO(date, { zone: timezone })
    .startOf("day")
    .plus({ days: 1 });
  return dt.toUTC().toJSDate();
}

/** Day of week for a venue-local date. 0 = Sunday ... 6 = Saturday. */
export function localDayOfWeek(date: string, timezone: string): number {
  const dt = DateTime.fromISO(date, { zone: timezone });
  // Luxon uses 1 = Monday ... 7 = Sunday; normalise to JS convention.
  return dt.weekday % 7;
}

/** Minutes from venue-local midnight for a UTC instant. */
export function minutesFromLocalMidnight(at: Date, timezone: string): number {
  const dt = DateTime.fromJSDate(at, { zone: timezone });
  return dt.hour * 60 + dt.minute;
}

/** The venue-local calendar date ("2026-09-01") of a UTC instant. */
export function localDateOf(at: Date, timezone: string): string {
  return DateTime.fromJSDate(at, { zone: timezone }).toISODate()!;
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  // Half-open intervals, matching the database exclusion constraint: a booking
  // ending exactly when another begins is not an overlap.
  return aStart < bEnd && bStart < aEnd;
}

/** Format a time range for display in the venue's timezone. */
export function formatRange(
  start: Date,
  end: Date,
  timezone: string,
): string {
  const s = DateTime.fromJSDate(start, { zone: timezone });
  const e = DateTime.fromJSDate(end, { zone: timezone });
  const sameDay = s.hasSame(e, "day");
  if (sameDay) {
    return `${s.toFormat("ccc d LLL yyyy, HH:mm")} – ${e.toFormat("HH:mm")}`;
  }
  return `${s.toFormat("ccc d LLL yyyy HH:mm")} – ${e.toFormat("ccc d LLL yyyy HH:mm")}`;
}

export function formatDateTime(at: Date, timezone = DEFAULT_TZ): string {
  return DateTime.fromJSDate(at, { zone: timezone }).toFormat(
    "d LLL yyyy, HH:mm",
  );
}

export function formatDate(at: Date, timezone = DEFAULT_TZ): string {
  return DateTime.fromJSDate(at, { zone: timezone }).toFormat("d LLL yyyy");
}

export function formatTime(at: Date, timezone = DEFAULT_TZ): string {
  return DateTime.fromJSDate(at, { zone: timezone }).toFormat("HH:mm");
}

/** "09:30" from minutes-from-midnight, for operating hours display. */
export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Inclusive list of venue-local dates spanned by a range. */
export function datesBetween(from: string, to: string): string[] {
  const start = DateTime.fromISO(from);
  const end = DateTime.fromISO(to);
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor.toISODate()!);
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

export { DateTime, Interval };
