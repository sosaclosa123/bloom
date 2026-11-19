import { describe, expect, it } from 'vitest';
import { alertsDueBetween } from './alerts';
import { parseLocal } from './dates';
import { emptySnapshot, merge, newMeta, normalizeSnapshot, remove, upsert } from './db';
import { easterSunday, hebrewDateLabel, holidaysBetween } from './holidays';
import { parseQuickAdd } from './quickAdd';
import { expandEvents, occurrencesBetween } from './recurrence';
import type { CalendarEvent, Reminder } from './types';

const NOW = new Date(2026, 10, 19, 10, 0); // Thu 19 Nov 2026

function ev(p: Partial<CalendarEvent>): CalendarEvent {
  return {
    ...newMeta(),
    title: 'X',
    allDay: false,
    start: '2026-11-19T14:00',
    end: '2026-11-19T15:00',
    color: 'sky',
    notes: '',
    location: '',
    repeat: 'none',
    remindBefore: [],
    sound: 'builtin:chime',
    ...p,
  };
}

describe('quick add', () => {
  it('parses weekday, time and reminder', () => {
    const r = parseQuickAdd('dinner fri 20:00 remind 1h', NOW);
    expect(r).toMatchObject({ title: 'dinner', date: '2026-11-20', start: '20:00', end: '21:00', remindBefore: [60] });
  });
  it('parses ranges, tomorrow and repeat', () => {
    const r = parseQuickAdd('gym tomorrow 7-8:30am every week', NOW);
    expect(r).toMatchObject({ title: 'gym', date: '2026-11-20', start: '07:00', end: '08:30', repeat: 'weekly' });
  });
  it('parses numeric dates and pm', () => {
    expect(parseQuickAdd('party 5/12 8pm', NOW)).toMatchObject({ title: 'party', date: '2026-12-05', start: '20:00' });
    expect(parseQuickAdd('trip 3/1', NOW)).toMatchObject({ title: 'trip', date: '2027-01-03', start: null });
    expect(parseQuickAdd('dentist dec 3 at 9:15', NOW)).toMatchObject({ title: 'dentist', date: '2026-12-03', start: '09:15' });
  });
  it('parses Hebrew', () => {
    expect(parseQuickAdd('ארוחת ערב מחר ב-20:00 תזכורת 30 דקות', NOW)).toMatchObject({
      title: 'ארוחת ערב',
      date: '2026-11-20',
      start: '20:00',
      remindBefore: [30],
    });
    expect(parseQuickAdd('רופא שיניים ביום שישי 9:00 תזכיר לי שעה לפני', NOW)).toMatchObject({
      title: 'רופא שיניים',
      date: '2026-11-20',
      start: '09:00',
      remindBefore: [60],
    });
    expect(parseQuickAdd('ספורט כל שבוע ראשון 18:00', NOW)).toMatchObject({ title: 'ספורט', date: '2026-11-22', repeat: 'weekly' });
  });
  it('leaves plain text alone', () => {
    expect(parseQuickAdd('buy flowers', NOW)).toMatchObject({ title: 'buy flowers', date: '2026-11-19', start: null });
  });
});

describe('recurrence', () => {
  it('monthly clamps to short months', () => {
    const occ = occurrencesBetween('2026-01-31T09:00', 'monthly', new Date(2026, 0, 1), new Date(2026, 4, 1));
    expect(occ.map((d) => d.getDate())).toEqual([31, 28, 31, 30]);
  });
  it('yearly keeps the date', () => {
    const occ = occurrencesBetween('2020-06-10T00:00', 'yearly', new Date(2026, 0, 1), new Date(2028, 0, 1));
    expect(occ.map((d) => d.getFullYear())).toEqual([2026, 2027]);
  });
  it('expands events overlapping a range, including multi-day', () => {
    const e = ev({ start: '2026-11-18T22:00', end: '2026-11-19T02:00' });
    expect(expandEvents([e], new Date(2026, 10, 19), new Date(2026, 10, 20))).toHaveLength(1);
    const e2 = ev({ start: '2026-11-18T22:00', end: '2026-11-19T00:00' });
    expect(expandEvents([e2], new Date(2026, 10, 19), new Date(2026, 10, 20))).toHaveLength(0);
  });
});

describe('alerts', () => {
  it('fires event reminders before start and standalone reminders on time', () => {
    const e = ev({ remindBefore: [15, 0] });
    const r: Reminder = { ...newMeta(), title: 'Pills', at: '2026-11-19T09:00', repeat: 'daily', sound: 's', note: '' };
    const from = parseLocal('2026-11-19T13:40').getTime();
    const to = parseLocal('2026-11-19T13:50').getTime();
    expect(alertsDueBetween({ events: [e], reminders: [r] }, from, to).map((a) => a.minutesBefore)).toEqual([15]);
    const next = alertsDueBetween(
      { events: [], reminders: [r] },
      parseLocal('2026-11-21T08:59').getTime(),
      parseLocal('2026-11-21T09:00').getTime(),
    );
    expect(next.map((a) => a.when)).toEqual(['2026-11-21T09:00']);
  });
});

describe('db', () => {
  it('upserts, soft-deletes and merges by updatedAt', () => {
    let a = emptySnapshot('a');
    const e = ev({ title: 'one' });
    a = upsert(a, 'events', e);
    let b = { ...a, events: a.events.map((x) => ({ ...x, title: 'two', updatedAt: x.updatedAt + 1000 })) };
    expect(merge(a, b).events[0].title).toBe('two');
    b = remove(b, 'events', e.id);
    expect(merge(a, b).events[0].deletedAt).toBeTruthy();
  });
});

describe('holidays', () => {
  it('computes Easter', () => {
    expect(easterSunday(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(easterSunday(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
  });
  it('lists Jewish and Christian holidays', () => {
    const map = holidaysBetween('both', new Date(2026, 11, 1), new Date(2027, 0, 1), 'en');
    expect(map.get('2026-12-25')?.map((h) => h.name)).toContain('Christmas');
    expect([...map.values()].flat().some((h) => /Chanukah/.test(h.name))).toBe(true);
    const he = holidaysBetween('jewish', new Date(2026, 8, 1), new Date(2026, 9, 1), 'he');
    expect([...he.values()].flat().some((h) => h.name.includes('יום כפור') || h.name.includes('יום כיפור'))).toBe(true);
    expect(hebrewDateLabel(new Date(2026, 10, 19), 'he')).toMatch(/כסלו/);
  });
});

describe('migration', () => {
  it('makes reminders from before sync private', () => {
    const old = { schemaVersion: 1, events: [], reminders: [{ ...newMeta(), title: 'Pills', at: '2026-01-01T09:00', repeat: 'daily', sound: '', note: '' }] };
    expect(normalizeSnapshot(old).reminders[0].visibility).toBe('private');
    const now = normalizeSnapshot({ ...old, schemaVersion: 2 });
    expect(now.reminders[0].visibility).toBe('shared');
  });
});
