import { describe, expect, it } from 'vitest';
import { alertsDueBetween } from './alerts';
import { parseLocal } from './dates';
import { asPrivateDay, emptySnapshot, merge, newMeta, normalizeSnapshot, personalDays, remove, upsert } from './db';
import { easterSunday, hebrewDateLabel, holidaysBetween } from './holidays';
import { parseQuickAdd } from './quickAdd';
import { expandEvents, occurrencesBetween } from './recurrence';
import type { CalendarEvent, DayEntry, Reminder } from './types';

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
  it('turns old reminders into events and makes everything private', () => {
    const old = {
      schemaVersion: 1,
      events: [{ ...newMeta(), visibility: 'shared', title: 'Dinner', allDay: false, start: '2026-01-01T20:00', end: '2026-01-01T21:00', color: 'rose', notes: '', location: '', repeat: 'none', remindBefore: [], sound: '' }],
      reminders: [{ ...newMeta(), visibility: 'shared', title: 'Pills', at: '2026-01-01T09:00', repeat: 'daily', sound: 's', note: 'with food' }],
    };
    const snap = normalizeSnapshot(old);
    expect(snap.events.every((e) => e.visibility === 'private')).toBe(true);
    const pills = snap.events.find((e) => e.title === 'Pills')!;
    expect(pills).toMatchObject({ start: '2026-01-01T09:00', repeat: 'daily', remindBefore: [0], notes: 'with food' });
    expect(snap.reminders[0].deletedAt).toBeTruthy();
    // Already-migrated data is left alone.
    expect(normalizeSnapshot({ ...snap, schemaVersion: 3 }).events).toHaveLength(2);
  });
  it('creates new records as private', () => {
    expect(newMeta().visibility).toBe('private');
  });
});

describe('hebrew dates', () => {
  it('formats with ב and repeats on the same Hebrew date', async () => {
    const { sameHebrewDate } = await import('./recurrence');
    expect(hebrewDateLabel(new Date(2026, 10, 26), 'he')).toBe('ט״ז בכסלו');
    // 16 Kislev 5787 = 26 Nov 2026 -> 16 Kislev 5788 = 16 Dec 2027
    expect(sameHebrewDate(new Date(2026, 10, 26, 19, 30), 1).toString()).toBe(new Date(2027, 11, 16, 19, 30).toString());
    // Birthday in plain Adar (5785, not leap) lands in Adar II in a leap year (5787)
    const adar = sameHebrewDate(new Date(2025, 2, 10), 2); // 10 Mar 2025 = 10 Adar 5785
    expect(hebrewDateLabel(adar, 'he')).toMatch(/אדר ב/);
    const occ = occurrencesBetween('2026-11-26T19:30', 'hebrewYearly', new Date(2027, 0, 1), new Date(2029, 0, 1));
    expect(occ.map((d) => hebrewDateLabel(d, 'he'))).toEqual(['ט״ז בכסלו', 'ט״ז בכסלו']);
  });
});

describe('repeat every N', () => {
  const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

  it('every 2 weeks (medicine)', () => {
    const occ = occurrencesBetween('2026-11-02T08:00', 'weekly', new Date(2026, 10, 1), new Date(2027, 0, 1), 0, 2);
    expect(occ.map(d)).toEqual(['2026-11-02', '2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28']);
  });
  it('every 2 weeks, far in the future, stays on the right week', () => {
    const occ = occurrencesBetween('2026-11-02T08:00', 'weekly', new Date(2030, 0, 1), new Date(2030, 0, 31), 0, 2);
    for (const o of occ) expect(Math.round((o.getTime() - new Date(2026, 10, 2, 8).getTime()) / 86400000) % 14).toBe(0);
    expect(occ).toHaveLength(2);
  });
  it('every 3 days and every 3 months (keeps the 31st clamped)', () => {
    expect(occurrencesBetween('2026-11-01T09:00', 'daily', new Date(2026, 10, 1), new Date(2026, 10, 11), 0, 3).map(d)).toEqual(['2026-11-01', '2026-11-04', '2026-11-07', '2026-11-10']);
    expect(occurrencesBetween('2026-01-31T09:00', 'monthly', new Date(2026, 0, 1), new Date(2027, 0, 1), 0, 3).map(d)).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
  });
  it('bad values fall back to 1', () => {
    for (const bad of [0, -2, 1.5, NaN, 500, undefined]) {
      expect(occurrencesBetween('2026-11-01T09:00', 'daily', new Date(2026, 10, 1), new Date(2026, 10, 4), 0, bad as number)).toHaveLength(3);
    }
  });
  it('calendar and reminders follow the interval', () => {
    const e: CalendarEvent = { ...newMeta(), title: 'Pill', allDay: false, start: '2026-11-02T08:00', end: '2026-11-02T08:15', color: 'mint', notes: '', location: '', repeat: 'weekly', repeatEvery: 2, remindBefore: [0], sound: 'builtin:chime' };
    expect(expandEvents([e], new Date(2026, 10, 1), new Date(2026, 11, 1)).map((o) => d(o.start))).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
    const fired = alertsDueBetween({ events: [e], reminders: [] }, new Date(2026, 10, 8).getTime(), new Date(2026, 10, 17).getTime());
    expect(fired.map((a) => a.when)).toEqual(['2026-11-16T08:00']); // not on the 9th
  });
});

describe('day info stays private', () => {
  const day = (p: Partial<DayEntry>): DayEntry => ({ ...newMeta(), date: '2026-11-20', status: null, headline: '', cards: [], ...p });

  it('tapping the busy dot on a day that has an old shared record creates my own private one', () => {
    const shared = day({ id: 'old', visibility: 'shared', headline: 'From before' });
    const edited = { ...shared, status: 'packed' as const };
    const saved = asPrivateDay(edited, [shared]);
    expect(saved.visibility).toBe('private');
    expect(saved.id).not.toBe('old'); // the shared record is not touched
    expect(saved.status).toBe('packed');
  });
  it('more edits go into that same private record (no duplicates)', () => {
    const shared = day({ id: 'old', visibility: 'shared' });
    const mine = day({ id: 'mine', visibility: 'private' });
    expect(asPrivateDay({ ...shared, status: 'free' }, [shared, mine]).id).toBe('mine');
  });
  it('private records are saved as they are', () => {
    const mine = day({ id: 'mine' });
    expect(asPrivateDay(mine, [mine])).toBe(mine);
  });
  it('the calendar shows my private record when both exist, one per date', () => {
    const shared = day({ id: 'old', visibility: 'shared' });
    const mine = day({ id: 'mine' });
    const other = day({ id: 'x', date: '2026-11-21', visibility: 'shared' });
    expect(personalDays([shared, mine, other]).map((d) => d.id).sort()).toEqual(['mine', 'x']);
    expect(personalDays([mine, shared]).map((d) => d.id)).toEqual(['mine']);
    expect(personalDays([{ ...mine, deletedAt: 5 }, shared]).map((d) => d.id)).toEqual(['old']);
  });
});
