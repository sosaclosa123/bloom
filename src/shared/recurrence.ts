// Expands repeating items into concrete occurrences in a time range.
// Shared by the UI (to draw the calendar) and the reminder scheduler.
import { HDate, months } from '@hebcal/core';
import { addDays, addMonths, daysInMonth, parseLocal, toLocalDateTime } from './dates';
import type { CalendarEvent, LocalDateTime, Repeat } from './types';

/** Occurrence n of a repeating start time (n = 0 is the original). */
export function nthOccurrence(start: Date, repeat: Repeat, n: number): Date {
  switch (repeat) {
    case 'none':
      return start;
    case 'daily':
      return addDays(start, n);
    case 'weekly':
      return addDays(start, 7 * n);
    case 'monthly': {
      // Keep the original day of month; clamp for short months (31st -> 30th/28th).
      const d = new Date(start.getFullYear(), start.getMonth() + n, 1, start.getHours(), start.getMinutes());
      d.setDate(Math.min(start.getDate(), daysInMonth(d.getFullYear(), d.getMonth())));
      return d;
    }
    case 'yearly':
      return addMonths(start, 12 * n);
    case 'hebrewYearly':
      return sameHebrewDate(start, n);
  }
}

/**
 * The same Hebrew date n years later. Handles the calendar's quirks:
 * Adar in leap years (Adar I/II) and the 30th of months that sometimes have 29 days.
 */
export function sameHebrewDate(start: Date, n: number): Date {
  const hd = new HDate(start);
  const year = hd.getFullYear() + n;
  let month = hd.getMonth();
  const leapNow = HDate.isLeapYear(hd.getFullYear());
  const leapThen = HDate.isLeapYear(year);
  if (month === months.ADAR_II && !leapThen) month = months.ADAR_I; // Adar II -> plain Adar
  else if (month === months.ADAR_I && !leapNow && leapThen) month = months.ADAR_II; // plain Adar -> Adar II (common custom)
  const day = Math.min(hd.getDate(), HDate.daysInMonth(month, year));
  const g = new HDate(day, month, year).greg();
  return new Date(g.getFullYear(), g.getMonth(), g.getDate(), start.getHours(), start.getMinutes());
}

/**
 * Occurrence start times of a (possibly repeating) item whose span
 * [occStart, occStart + durationMs] overlaps [from, to).
 */
export function occurrencesBetween(
  start: LocalDateTime,
  repeat: Repeat,
  from: Date,
  to: Date,
  durationMs = 0,
): Date[] {
  const s = parseLocal(start);
  const out: Date[] = [];
  if (repeat === 'none') {
    if (s.getTime() + durationMs >= from.getTime() && s < to) out.push(s);
    return out;
  }
  // Skip ahead cheaply for daily/weekly rather than iterating from the beginning.
  let n = 0;
  const lead = from.getTime() - durationMs - s.getTime();
  if (lead > 0) {
    if (repeat === 'daily') n = Math.max(0, Math.floor(lead / 86400000) - 1);
    else if (repeat === 'weekly') n = Math.max(0, Math.floor(lead / (7 * 86400000)) - 1);
    else if (repeat === 'monthly') n = Math.max(0, Math.floor(lead / (31 * 86400000)) - 1);
    else if (repeat === 'yearly' || repeat === 'hebrewYearly') n = Math.max(0, Math.floor(lead / (390 * 86400000)) - 1);
  }
  for (let guard = 0; guard < 5000; guard++, n++) {
    const occ = nthOccurrence(s, repeat, n);
    if (occ >= to) break;
    if (occ.getTime() + durationMs >= from.getTime()) out.push(occ);
  }
  return out;
}

export interface EventOccurrence {
  event: CalendarEvent;
  start: Date;
  end: Date;
  /** Stable key for this occurrence, e.g. for reminder bookkeeping. */
  key: string;
}

export function eventDuration(ev: CalendarEvent): number {
  return Math.max(0, parseLocal(ev.end).getTime() - parseLocal(ev.start).getTime());
}

export function expandEvents(events: CalendarEvent[], from: Date, to: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const ev of events) {
    if (ev.deletedAt) continue;
    const dur = eventDuration(ev);
    for (const start of occurrencesBetween(ev.start, ev.repeat, from, to, dur)) {
      // An event ending exactly at midnight shouldn't spill into the next day.
      const end = new Date(start.getTime() + dur);
      if (end.getTime() === from.getTime() && dur > 0) continue;
      out.push({ event: ev, start, end, key: `${ev.id}@${toLocalDateTime(start)}` });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.event.allDay) - Number(a.event.allDay));
}
