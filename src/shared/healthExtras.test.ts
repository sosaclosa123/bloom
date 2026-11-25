import { describe, expect, it } from 'vitest';
import { newMeta } from './db';
import { emptyProfile, medDueOn, nextMedDate, sleepFromTimes } from './health';
import { badges, behindPace, challengeDays, dayFacts, flareLine, foodSeries, goalPeriod, goalProgress, ibdSeries, monthSummary, nudgePlan, streak } from './healthExtras';
import type { HealthChallenge, HealthGoal, HealthItem } from './types';

const profile = { ...newMeta(), ...emptyProfile(), sex: 'female' as const, completed: true };
const checkin = (date: string, waterMl: number, extra = {}) => ({ ...newMeta(), kind: 'checkin' as const, date, waterMl, mood: 4, sleepH: 7, energy: 3, stress: 2, ...extra });
const day = (n: number) => `2026-03-${String(n).padStart(2, '0')}`;

describe('medication schedule', () => {
  it('every day by default; every 2 weeks / every month from the start date', () => {
    expect(medDueOn({}, '2026-03-05')).toBe(true);
    const inj = { every: 2, unit: 'week' as const, startDate: '2026-03-01' };
    expect(medDueOn(inj, '2026-03-01')).toBe(true);
    expect(medDueOn(inj, '2026-03-08')).toBe(false);
    expect(medDueOn(inj, '2026-03-15')).toBe(true);
    expect(medDueOn(inj, '2026-02-15')).toBe(false);
    expect(nextMedDate(inj, '2026-03-02')).toBe('2026-03-15');
    const monthly = { every: 1, unit: 'month' as const, startDate: '2026-01-31' };
    expect(medDueOn(monthly, '2026-02-28')).toBe(true);
    expect(medDueOn(monthly, '2026-03-31')).toBe(true);
    expect(medDueOn({ every: 3, unit: 'day', startDate: '2026-03-01' }, '2026-03-04')).toBe(true);
  });
});

describe('sleep from bed and wake times', () => {
  it('works over midnight', () => {
    expect(sleepFromTimes('23:30', '07:00')).toBe(7.5);
    expect(sleepFromTimes('01:10', '08:00')).toBe(6.75);
    expect(sleepFromTimes('x', '08:00')).toBeNull();
  });
});

describe('streaks and summaries', () => {
  const all: HealthItem[] = [profile, checkin(day(1), 1600), checkin(day(2), 1700), checkin(day(3), 500), checkin(day(4), 1600), checkin(day(5), 1600)];
  it('counts days in a row; today still open does not break it', () => {
    expect(streak(all, day(5), false, (f) => f.waterMet)).toBe(2);
    expect(streak([...all, checkin(day(6), 200)], day(6), false, (f) => f.waterMet)).toBe(2);
    expect(dayFacts(all, day(1), false)).toMatchObject({ waterMet: true, checkinFull: true, sleepH: 7 });
  });
  it('monthly summary', () => {
    const m = monthSummary(all, '2026-03', false);
    expect(m).toMatchObject({ daysLogged: 5, waterGoalDays: 4, avgSleep: 7, avgMood: 4, medsPct: null });
  });
});

describe('mini-goals', () => {
  const g: HealthGoal = { ...newMeta(), kind: 'goal', title: 'Gym', sticker: 'gym', target: 4, every: 1, unit: 'week', startDate: '2026-03-04', active: true };
  it('weeks follow the calendar week start, months the calendar month', () => {
    expect(goalPeriod(g, '2026-03-04', 0)).toEqual({ start: '2026-03-01', end: '2026-03-07' });
    expect(goalPeriod(g, '2026-03-09', 1)).toEqual({ start: '2026-03-09', end: '2026-03-15' });
    expect(goalPeriod({ ...g, every: 2, unit: 'month', startDate: '2026-01-15' }, '2026-04-10', 0)).toEqual({ start: '2026-03-01', end: '2026-04-30' });
    expect(goalPeriod({ ...g, every: 3, unit: 'day', startDate: '2026-03-01' }, '2026-03-05', 0)).toEqual({ start: '2026-03-04', end: '2026-03-06' });
  });
  it('stays done until the next period starts', () => {
    const ticks: HealthItem[] = [1, 2, 3, 4].map((n) => ({ ...newMeta(), kind: 'tick' as const, goalId: g.id, date: day(n + 1) }));
    expect(goalProgress([g, ...ticks], g, day(7), 0)).toMatchObject({ count: 4, done: true });
    expect(goalProgress([g, ...ticks], g, day(8), 0)).toMatchObject({ count: 0, done: false });
  });
});

describe('7-day challenges', () => {
  it('checks automatic days from the logs and manual ticks', () => {
    const c: HealthChallenge = { ...newMeta(), kind: 'challenge', challenge: 'water', startDate: day(1), manualDays: [day(3)], stopped: false };
    const all: HealthItem[] = [profile, c, ...[1, 2, 4, 5, 6, 7].map((n) => checkin(day(n), 1600))];
    expect(challengeDays(all, c, day(7), false)).toMatchObject({ done: true, status: 'done' });
    expect(challengeDays(all, c, day(5), false).status).toBe('active');
    expect(challengeDays(all.filter((x) => (x as { date?: string }).date !== day(6)), c, day(9), false).status).toBe('missed');
  });
});

describe('sticker book', () => {
  it('earns badges on the day the count is reached', () => {
    const all: HealthItem[] = [profile, ...Array.from({ length: 8 }, (_, i) => checkin(day(i + 1), 1600))];
    const b = badges(all, day(10), false, 0);
    expect(b.find((x) => x.id === 'water-1')?.earned).toBe(day(1));
    expect(b.find((x) => x.id === 'water-7')?.earned).toBe(day(7));
    expect(b.find((x) => x.id === 'waterStreak-7')?.earned).toBe(day(7));
    expect(b.find((x) => x.id === 'water-30')?.earned).toBeNull();
    expect(b.some((x) => x.family.ibd)).toBe(false); // IBD badges only when IBD is on
    expect(badges(all, day(10), true, 0).some((x) => x.family.ibd)).toBe(true);
    expect(b.length).toBeGreaterThan(90);
  });
});

describe('water nudges', () => {
  it('about one glass per nudge, spread over the chosen hours', () => {
    const p = nudgePlan(1600, 250, '08:00', '21:30'); // 13.5 h window, 7 glasses
    expect(p.intervalMin).toBe(116);
    expect(Math.max(...p.slots)).toBeLessThanOrEqual(21 * 60 + 30);
    // Default (owner): 09:00 to midnight; never before 09:00 or after 00:00.
    const d = nudgePlan(2000, 250);
    expect(Math.min(...d.slots)).toBeGreaterThan(9 * 60);
    expect(Math.max(...d.slots)).toBeLessThanOrEqual(24 * 60);
    expect(nudgePlan(3500, 250).intervalMin).toBe(64); // 15 h (09:00-00:00) / 14 glasses
    expect(nudgePlan(1200, 500).intervalMin).toBe(180); // never less often than every 3 h
    // At 12:00 the even pace is ~474 ml: 0 ml -> behind, 400 ml -> fine.
    expect(behindPace(p, 1600, 250, 0, 12 * 60)).toBe(true);
    expect(behindPace(p, 1600, 250, 400, 12 * 60)).toBe(false);
  });
});

describe('health reminders', async () => {
  const { alertsDueBetween } = await import('./alerts');
  const { DEFAULT_SETTINGS } = await import('./types');
  const at = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m).getTime();
  it('every-2-weeks medication only on its days', () => {
    const med = { ...newMeta(), kind: 'med' as const, name: 'X', dose: '', times: ['08:00'], remind: true, active: true, supplement: false, every: 2, unit: 'week' as const, startDate: '2026-03-01' };
    const s = { ...DEFAULT_SETTINGS, healthEnabled: true };
    expect(alertsDueBetween({ events: [], reminders: [], settings: s, health: [med] }, at(1, 7), at(1, 9))).toHaveLength(1);
    expect(alertsDueBetween({ events: [], reminders: [], settings: s, health: [med] }, at(8, 7), at(8, 9))).toHaveLength(0);
  });
  it('water nudges only when on and behind; weigh-in on its weekday', () => {
    const s = { ...DEFAULT_SETTINGS, healthEnabled: true, healthWaterNudge: true };
    const behind = alertsDueBetween({ events: [], reminders: [], settings: s, health: [profile] }, at(3, 8), at(3, 14));
    expect(behind.length).toBeGreaterThan(1);
    expect(behind.every((a) => a.kind === 'water')).toBe(true);
    const ok = alertsDueBetween({ events: [], reminders: [], settings: s, health: [profile, checkin('2026-03-03', 1600)] }, at(3, 8), at(3, 14));
    expect(ok).toHaveLength(0);
    expect(alertsDueBetween({ events: [], reminders: [], settings: { ...s, healthWaterNudge: false }, health: [profile] }, at(3, 8), at(3, 14))).toHaveLength(0);
    const weigh = { ...DEFAULT_SETTINGS, healthEnabled: true, healthWeighDay: 0 }; // Sunday 1 March 2026
    expect(alertsDueBetween({ events: [], reminders: [], settings: weigh, health: [profile] }, at(1, 8), at(1, 10)).map((a) => a.kind)).toEqual(['weigh']);
    const weighed = { ...newMeta(), kind: 'body' as const, date: '2026-02-27', weightKg: 60, exerciseMin: null, steps: null };
    expect(alertsDueBetween({ events: [], reminders: [], settings: weigh, health: [profile, weighed] }, at(1, 8), at(1, 10))).toHaveLength(0);
  });
});

describe('doctor report data', async () => {
  const { reportData } = await import('./healthExtras');
  it('weekly averages, first date of each symptom, flare ranges', () => {
    const bathroom = (date: string, bristol: number, blood = false) => ({ ...newMeta(), kind: 'bathroom' as const, date, time: '09:00', bristol, urgency: 0, blood, bloodLevel: blood ? 2 : 0, pain: 0, notes: '' });
    const ibdday = (date: string, wellbeing: number, pain: number, fatigue: number, complications: string[] = [], flare: 'none' | 'flare' = 'none') => ({ ...newMeta(), kind: 'ibdday' as const, date, wellbeing, pain, fatigue, mass: null, complications, liquidStools: null, bleeding: null, flare });
    const all: HealthItem[] = [
      { ...profile, ibdType: 'crohns' as const },
      bathroom('2026-03-01', 4), bathroom('2026-03-01', 6), bathroom('2026-03-02', 4),
      ibdday('2026-03-01', 1, 1, 2), ibdday('2026-03-02', 3, 2, 2, ['aphthous'], 'flare'), ibdday('2026-03-03', 2, 1, 1, ['aphthous', 'arthralgia'], 'flare'),
      ibdday('2026-03-09', 0, 0, 0, ['arthralgia']),
    ];
    const r = reportData(all, '2026-03-01', '2026-03-10', true, 0); // 1 March 2026 is a Sunday
    expect(r.weeks.map((w) => w.start)).toEqual(['2026-03-01', '2026-03-08']);
    expect(r.weeks[0]).toMatchObject({ stoolsPerDay: 1, wellbeing: 2, pain: 1.3, fatigue: 1.7, flareDays: 2 });
    expect(r.symptoms).toEqual([
      { id: 'aphthous', first: '2026-03-02', days: 2 },
      { id: 'arthralgia', first: '2026-03-03', days: 2 },
    ]);
    expect(r.flareRanges).toEqual([{ from: '2026-03-02', to: '2026-03-03' }]);
    expect(r.daily.find((d) => d.date === '2026-03-01')).toMatchObject({ stools: 2, loose: 1 });
  });
});

describe('IBD history lines', () => {
  const d = (date: string, wellbeing: number | null, pain: number | null, fatigue: number | null) =>
    ({ ...newMeta(), kind: 'ibdday' as const, date, wellbeing, pain, fatigue, mass: null, complications: [], liquidStools: 0, bleeding: null, flare: 'none' as const });
  const all: HealthItem[] = [profile, d(day(1), 0, 0, 0), d(day(2), 4, 3, 3), d(day(3), null, 2, null)];
  it('one point per logged day, higher = worse', () => {
    expect(ibdSeries(all, 'pain', day(1), day(31)).map((p) => p.value)).toEqual([0, 3, 2]);
    expect(ibdSeries(all, 'feeling', day(1), day(31)).map((p) => p.value)).toEqual([0, 4]);
    expect(ibdSeries(all, 'tired', day(2), day(31))).toEqual([{ date: day(2), value: 3 }]);
    expect(ibdSeries(all, 'flare', day(1), day(31)).length).toBe(3);
  });
  it('overall = average of what was logged, 0-10', () => {
    const o = ibdSeries(all, 'overall', day(1), day(31));
    expect(o[0].value).toBe(0);
    expect(o[1].value).toBeGreaterThan(7);
    expect(o[1].value).toBeLessThanOrEqual(10);
  });
  it('flare line: HBI 8, SCCAI 5', () => {
    expect(flareLine('hbi')).toBe(8);
    expect(flareLine('uc')).toBe(5);
  });
});

describe('food history line', () => {
  const f = (date: string, kcal: number | null, fat: number | null, deletedAt: number | null = null) =>
    ({ ...newMeta(), deletedAt, kind: 'food' as const, date, time: '', meal: 'lunch' as const, text: 'x', tags: [], kcal, fat, carbs: null, protein: null });
  const all: HealthItem[] = [f(day(1), 300, 10), f(day(1), 200.5, null), f(day(2), null, 5), f(day(3), 999, 1, 7), f(day(9), 100, 2)];
  it('adds up each day; skips days without that number and deleted items', () => {
    expect(foodSeries(all, 'kcal', day(1), day(5))).toEqual([{ date: day(1), value: 500.5 }]);
    expect(foodSeries(all, 'fat', day(1), day(31)).map((p) => p.value)).toEqual([10, 5, 2]);
    expect(foodSeries(all, 'carbs', day(1), day(31))).toEqual([]);
  });
});
