import { DateTime, Interval } from 'luxon';
import type { OpeningHoursMap, SpecialDayConfig } from '@core/interfaces/booking.types.js';

const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function weekdayKey(dt: DateTime): keyof OpeningHoursMap {
  // Luxon: weekday 1..7 (Mon..Sun). Map to 0..6 with %7: Sun (7) -> 0.
  return WEEK_KEYS[dt.weekday % 7] as keyof OpeningHoursMap;
}

export function parseRange(
  dayISO: string,
  tz: string,
  range: string,
): { start: DateTime; end: DateTime } {
  // range is "HH:mm-HH:mm"
  const [s, e] = range.split('-');
  const start = DateTime.fromISO(`${dayISO}T${s}`, { zone: tz });
  const end = DateTime.fromISO(`${dayISO}T${e}`, { zone: tz });
  return { start, end };
}

/** Returns opening windows for a given date (ISO 'yyyy-MM-dd'), considering specialDays override. */
export function openingWindowsForDate(
  dayISO: string,
  tz: string,
  opening: OpeningHoursMap,
  special?: SpecialDayConfig,
) {
  const dt = DateTime.fromISO(dayISO, { zone: tz });
  if (!dt.isValid) return [];
  const override = special?.[dayISO];
  const ranges = Array.isArray(override)
    ? override
    : override === null
      ? [] // forced closed
      : opening[weekdayKey(dt)] ?? [];
  return ranges
    .map((r) => parseRange(dayISO, tz, r))
    .filter((w) => w.start.isValid && w.end.isValid && w.start < w.end);
}

/** Build a slot grid (start-inclusive, end-exclusive) with given slot minutes, confined inside opening windows. */
export function buildSlotsForDay(
  dayISO: string,
  tz: string,
  opening: OpeningHoursMap,
  slotSizeMinutes: number,
  special?: SpecialDayConfig,
): Interval[] {
  const windows = openingWindowsForDate(dayISO, tz, opening, special);
  const slots: Interval[] = [];
  for (const w of windows) {
    let cursor = w.start;
    while (cursor < w.end) {
      const next = cursor.plus({ minutes: slotSizeMinutes });
      if (next > w.end) break;
      slots.push(Interval.fromDateTimes(cursor, next));
      cursor = next;
    }
  }
  return slots;
}
