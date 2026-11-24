// Derives what to draw for a date range from the raw data.
import { useMemo } from 'react';
import { addDays, parseISODate, startOfDay, toISODate } from '../shared/dates';
import { holidaysBetween, type Holiday } from '../shared/holidays';
import { expandEvents, occurrencesBetween, type EventOccurrence } from '../shared/recurrence';
import type { DayEntry, ISODate, Reminder } from '../shared/types';
import { useAlive, useBloom } from './store';

export interface ReminderOccurrence {
  reminder: Reminder;
  at: Date;
}

export interface RangeData {
  eventsByDay: Map<ISODate, EventOccurrence[]>;
  remindersByDay: Map<ISODate, ReminderOccurrence[]>;
  days: Map<ISODate, DayEntry>;
  holidays: Map<ISODate, Holiday[]>;
}

export function useRangeData(from: Date, to: Date): RangeData {
  const { settings } = useBloom();
  const events = useAlive('events');
  const reminders = useAlive('reminders');
  const dayEntries = useAlive('days');
  const fromT = from.getTime();
  const toT = to.getTime();

  const eventsByDay = useMemo(() => {
    const map = new Map<ISODate, EventOccurrence[]>();
    for (const occ of expandEvents(events, new Date(fromT), new Date(toT))) {
      // Spread multi-day events over each day they touch.
      let d = startOfDay(occ.start);
      const last = occ.event.allDay ? startOfDay(occ.end) : startOfDay(new Date(occ.end.getTime() - 1));
      for (let i = 0; d <= last && i < 62; i++, d = addDays(d, 1)) {
        if (d.getTime() < fromT || d.getTime() >= toT) continue;
        const key = toISODate(d);
        const arr = map.get(key) ?? [];
        arr.push(occ);
        map.set(key, arr);
      }
    }
    return map;
  }, [events, fromT, toT]);

  const remindersByDay = useMemo(() => {
    const map = new Map<ISODate, ReminderOccurrence[]>();
    for (const r of reminders) {
      for (const at of occurrencesBetween(r.at, r.repeat, new Date(fromT), new Date(toT))) {
        const key = toISODate(at);
        const arr = map.get(key) ?? [];
        arr.push({ reminder: r, at });
        map.set(key, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.at.getTime() - b.at.getTime());
    return map;
  }, [reminders, fromT, toT]);

  const days = useMemo(() => {
    const map = new Map<ISODate, DayEntry>();
    for (const d of dayEntries) map.set(d.date, d);
    return map;
  }, [dayEntries]);

  const holidays = useMemo(
    () => holidaysBetween(settings.holidays, new Date(fromT), new Date(toT), settings.language, settings.holidaysIsrael),
    [settings.holidays, settings.language, settings.holidaysIsrael, fromT, toT],
  );

  return { eventsByDay, remindersByDay, days, holidays };
}

/**
 * A "daily nudge": a daily event with no duration and a notification (e.g.
 * "take vitamins"). Shown in the day panel and week view, but not on every
 * day of the month grid or the Upcoming list, where it would just repeat.
 */
export function isDailyNudge(o: EventOccurrence): boolean {
  return o.event.repeat === 'daily' && o.event.start.slice(11) === o.event.end.slice(11) && o.event.remindBefore.length > 0;
}

// Date formatters are slow to create (phones especially), and the calendar
// formats ~100 dates per redraw: keep one per locale + style.
const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${locale}|${key}`;
  let f = formatters.get(k);
  if (!f) formatters.set(k, (f = new Intl.DateTimeFormat(locale, opts)));
  return f;
}

export function formatTime(d: Date, locale: string) {
  return fmt(locale, 'time', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** "Thursday 19 November" */
export function formatLongDay(d: Date, locale: string) {
  return fmt(locale, 'longday', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function formatDayTitle(date: ISODate, locale: string) {
  return formatLongDay(parseISODate(date), locale);
}

export function weekdayNames(locale: string, weekStart: 0 | 1, style: 'short' | 'narrow' | 'long' = 'short') {
  const f = fmt(locale, `wd-${style}`, { weekday: style });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 1 + ((i + weekStart) % 7))));
}


export { countdownsOn } from '../shared/schedule';
