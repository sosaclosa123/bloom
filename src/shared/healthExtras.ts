// Health extras (pure logic): day facts, streaks, monthly summary, personal
// mini-goals, 7-day challenges, the sticker book and water nudges.
import { bathroomStats, dayNum, dosesOn, fromDayNum, healthOf, ibdDayScore, ibdScores, isFlareDay, profileOf, sleepFromTimes, waterGoal } from './health';
import type { HealthBathroom, HealthBody, HealthCheckin, HealthIbdDay, HealthMedTaken, HealthProfile } from './types';
import type { HealthChallenge, HealthGoal, HealthItem, ISODate } from './types';

// ---------------------------------------------------------------- day facts

export interface DayFacts {
  date: ISODate;
  any: boolean; // anything logged in Health that day
  waterMl: number;
  waterGoalMl: number;
  waterMet: boolean;
  /** Doses planned that day, and all of them ticked. */
  doses: number;
  medsAll: boolean;
  checkinFull: boolean;
  sleepH: number | null;
  mood: number | null;
  exerciseMin: number;
  steps: number;
  weighed: boolean;
  food: boolean;
  wake: string | null;
}

export const sleepHours = (c: { sleepH: number | null; bed?: string | null; wake?: string | null } | undefined) =>
  c?.bed && c?.wake ? sleepFromTimes(c.bed, c.wake) : (c?.sleepH ?? null);

/** Records grouped by date (built once per data change; keeps long histories fast). */
interface HealthIndex {
  profile: HealthProfile | undefined;
  checkin: Map<ISODate, HealthCheckin>;
  body: Map<ISODate, HealthBody>;
  ibdday: Map<ISODate, HealthIbdDay>;
  bathroom: Map<ISODate, HealthBathroom[]>;
  taken: Map<ISODate, HealthMedTaken[]>;
  food: Set<ISODate>;
  meds: ReturnType<typeof healthOf<'med'>>;
}
const cache = new WeakMap<HealthItem[], HealthIndex>();
function indexOf(all: HealthItem[]): HealthIndex {
  let ix = cache.get(all);
  if (ix) return ix;
  ix = { profile: profileOf(all), checkin: new Map(), body: new Map(), ibdday: new Map(), bathroom: new Map(), taken: new Map(), food: new Set(), meds: healthOf(all, 'med') };
  const newest = <T extends { updatedAt: number }>(m: Map<ISODate, T>, d: ISODate, x: T) => {
    const cur = m.get(d);
    if (!cur || x.updatedAt > cur.updatedAt) m.set(d, x);
  };
  for (const x of all) {
    if (x.deletedAt) continue;
    if (x.kind === 'checkin') newest(ix.checkin, x.date, x);
    else if (x.kind === 'body') newest(ix.body, x.date, x);
    else if (x.kind === 'ibdday') newest(ix.ibdday, x.date, x);
    else if (x.kind === 'bathroom') ix.bathroom.set(x.date, [...(ix.bathroom.get(x.date) ?? []), x]);
    else if (x.kind === 'taken') ix.taken.set(x.date, [...(ix.taken.get(x.date) ?? []), x]);
    else if (x.kind === 'food') ix.food.add(x.date);
  }
  cache.set(all, ix);
  return ix;
}

/** IBD score + flare for one date (null = nothing logged). */
export function ibdOn(all: HealthItem[], date: ISODate) {
  const ix = indexOf(all);
  const day = ix.ibdday.get(date);
  const r = ibdDayScore(ix.profile, day, bathroomStats(ix.bathroom.get(date) ?? [], date));
  return r.any ? { ...r, flare: isFlareDay(day, r.level) } : null;
}

/** Everything the streaks, challenges and badges look at, per date. */
export function dayFacts(all: HealthItem[], date: ISODate, ibd: boolean): DayFacts {
  const ix = indexOf(all);
  const c = ix.checkin.get(date);
  const b = ix.body.get(date);
  const stats = bathroomStats(ix.bathroom.get(date) ?? [], date);
  const goal = waterGoal(ix.profile, { date, ibd, liquidStools: stats.liquid, exerciseMin: b?.exerciseMin ?? null }).ml;
  const doses = dosesOn(ix.meds, ix.taken.get(date) ?? [], date);
  const sleepH = sleepHours(c);
  const food = ix.food.has(date);
  const waterMl = c?.waterMl ?? 0;
  return {
    date,
    any: !!c || !!b || food || stats.total > 0 || doses.some((d) => d.taken),
    waterMl,
    waterGoalMl: goal,
    waterMet: waterMl > 0 && waterMl >= goal,
    doses: doses.length,
    medsAll: doses.length > 0 && doses.every((d) => d.taken),
    checkinFull: !!c && c.waterMl > 0 && c.mood != null && sleepH != null && c.energy != null && c.stress != null,
    sleepH,
    mood: c?.mood ?? null,
    exerciseMin: b?.exerciseMin ?? 0,
    steps: b?.steps ?? 0,
    weighed: !!b?.weightKg,
    food,
    wake: c?.wake ?? null,
  };
}

/** Days in a row (ending today, or yesterday if today isn't done yet) where `ok` holds. */
export function streak(all: HealthItem[], today: ISODate, ibd: boolean, ok: (f: DayFacts) => boolean): number {
  let n = 0;
  let d = dayNum(today);
  if (!ok(dayFacts(all, today, ibd))) d--;
  for (; n < 3660; n++, d--) if (!ok(dayFacts(all, fromDayNum(d), ibd))) break;
  return n;
}

// ---------------------------------------------------------------- monthly summary

export interface MonthSummary {
  month: string; // YYYY-MM
  daysLogged: number;
  avgWaterMl: number | null;
  waterGoalDays: number;
  avgSleep: number | null;
  avgMood: number | null;
  medsPct: number | null; // doses taken / planned
  flareDays: number;
  weightChange: number | null;
}

export function monthSummary(all: HealthItem[], month: string, ibd: boolean): MonthSummary {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const facts = dates.map((d) => dayFacts(all, d, ibd));
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  let planned = 0;
  let taken = 0;
  for (const d of dates) {
    const ds = dosesOn(healthOf(all, 'med'), healthOf(all, 'taken'), d);
    planned += ds.length;
    taken += ds.filter((x) => x.taken).length;
  }
  const weights = healthOf(all, 'body')
    .filter((b) => b.weightKg && b.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
  const scores = ibd ? ibdScores(all, profileOf(all), dates) : new Map();
  return {
    month,
    daysLogged: facts.filter((f) => f.any).length,
    avgWaterMl: avg(facts.filter((f) => f.waterMl > 0).map((f) => f.waterMl)),
    waterGoalDays: facts.filter((f) => f.waterMet).length,
    avgSleep: avg(facts.filter((f) => f.sleepH != null).map((f) => f.sleepH!)),
    avgMood: avg(facts.filter((f) => f.mood != null).map((f) => f.mood!)),
    medsPct: planned ? Math.round((taken / planned) * 100) : null,
    flareDays: [...scores.values()].filter((s) => s.flare).length,
    weightChange: weights.length >= 2 ? Math.round((weights[weights.length - 1].weightKg! - weights[0].weightKg!) * 10) / 10 : null,
  };
}

// ---------------------------------------------------------------- personal mini-goals

/** The period (inclusive dates) of a goal that contains `date`. Weeks follow the calendar's week start. */
export function goalPeriod(g: Pick<HealthGoal, 'every' | 'unit' | 'startDate'>, date: ISODate, weekStart: 0 | 1): { start: ISODate; end: ISODate } {
  const every = Math.max(1, g.every);
  if (g.unit === 'month') {
    const [sy, sm] = g.startDate.split('-').map(Number);
    const [y, m] = date.split('-').map(Number);
    const k = Math.floor(Math.max(0, (y - sy) * 12 + (m - sm)) / every) * every;
    const s = new Date(sy, sm - 1 + k, 1);
    const e = new Date(sy, sm - 1 + k + every, 0);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: iso(s), end: iso(e) };
  }
  let origin = dayNum(g.startDate);
  let len = every;
  if (g.unit === 'week') {
    // Start of the calendar week that holds the start date.
    const dow = new Date(origin * 86400000).getUTCDay();
    origin -= (dow - weekStart + 7) % 7;
    len = every * 7;
  }
  const k = Math.floor(Math.max(0, dayNum(date) - origin) / len);
  return { start: fromDayNum(origin + k * len), end: fromDayNum(origin + k * len + len - 1) };
}

export function goalProgress(all: HealthItem[], g: HealthGoal, date: ISODate, weekStart: 0 | 1) {
  const p = goalPeriod(g, date, weekStart);
  const count = healthOf(all, 'tick').filter((x) => x.goalId === g.id && x.date >= p.start && x.date <= p.end).length;
  return { ...p, count, done: count >= g.target };
}

/** How many periods of a goal were completed (for the sticker book). */
export function goalsCompleted(all: HealthItem[], weekStart: 0 | 1): { n: number; dates: ISODate[] } {
  const dates: ISODate[] = [];
  for (const g of healthOf(all, 'goal')) {
    const ticks = healthOf(all, 'tick')
      .filter((x) => x.goalId === g.id)
      .map((x) => x.date)
      .sort();
    const per = new Map<string, ISODate[]>();
    for (const d of ticks) {
      const k = goalPeriod(g, d, weekStart).start;
      per.set(k, [...(per.get(k) ?? []), d]);
    }
    for (const list of per.values()) if (list.length >= g.target) dates.push(list[g.target - 1]);
  }
  return { n: dates.length, dates: dates.sort() };
}

// ---------------------------------------------------------------- 7-day challenges

export interface ChallengeDef {
  id: string;
  sticker: string;
  /** Checked from the logs; null = ticked by hand. */
  auto: ((f: DayFacts) => boolean) | null;
  needsMeds?: boolean;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'water', sticker: 'rain', auto: (f) => f.waterMet },
  { id: 'sleep', sticker: 'sleep', auto: (f) => (f.sleepH ?? 0) >= 7 },
  { id: 'meds', sticker: 'pill', auto: (f) => f.medsAll, needsMeds: true },
  { id: 'checkin', sticker: 'done', auto: (f) => f.checkinFull },
  { id: 'move', sticker: 'gym', auto: (f) => f.exerciseMin >= 30 },
  { id: 'steps', sticker: 'run', auto: (f) => f.steps >= 7000 },
  { id: 'walk', sticker: 'plants', auto: null },
  { id: 'veg', sticker: 'groceries', auto: null },
  { id: 'nocaffeine', sticker: 'coffee', auto: null },
  { id: 'screens', sticker: 'dayoff', auto: null },
  { id: 'kind', sticker: 'flowers', auto: null },
];

export function challengeDays(all: HealthItem[], c: HealthChallenge, today: ISODate, ibd: boolean) {
  const def = CHALLENGES.find((x) => x.id === c.challenge);
  const start = dayNum(c.startDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = fromDayNum(start + i);
    const ok = c.manualDays.includes(date) || (!!def?.auto && date <= today && def.auto(dayFacts(all, date, ibd)));
    return { date, ok, future: date > today };
  });
  const done = days.every((d) => d.ok);
  const over = fromDayNum(start + 6) < today;
  return { days, done, status: done ? ('done' as const) : c.stopped || over ? ('missed' as const) : ('active' as const) };
}

// ---------------------------------------------------------------- sticker book

export interface BadgeFamily {
  id: string;
  sticker: string;
  tiers: number[];
  ibd?: boolean;
}

/** Long-lasting set: tiers go from the first day up to several years. */
export const BADGE_FAMILIES: BadgeFamily[] = [
  { id: 'logged', sticker: 'flowers', tiers: [1, 7, 30, 100, 200, 365, 730, 1095, 1825] },
  { id: 'water', sticker: 'rain', tiers: [1, 7, 30, 100, 200, 365, 500, 1000] },
  { id: 'waterStreak', sticker: 'beach', tiers: [3, 7, 14, 30, 60, 100, 180, 365] },
  { id: 'meds', sticker: 'pill', tiers: [1, 7, 30, 100, 365, 730] },
  { id: 'medsStreak', sticker: 'injection', tiers: [7, 30, 90, 180, 365] },
  { id: 'checkin', sticker: 'done', tiers: [1, 7, 30, 100, 365, 730, 1000] },
  { id: 'sleep', sticker: 'sleep', tiers: [7, 30, 100, 200, 365] },
  { id: 'sleepStreak', sticker: 'dayoff', tiers: [5, 14, 30, 60] },
  { id: 'move', sticker: 'gym', tiers: [1, 10, 50, 100, 250, 500] },
  { id: 'steps', sticker: 'run', tiers: [1, 10, 50, 100, 250] },
  { id: 'weigh', sticker: 'important', tiers: [1, 4, 12, 26, 52, 104, 156] },
  { id: 'mood', sticker: 'party', tiers: [7, 30, 100, 365] },
  { id: 'early', sticker: 'coffee', tiers: [5, 25, 100] },
  { id: 'food', sticker: 'cooking', tiers: [1, 30, 100, 365] },
  { id: 'tests', sticker: 'hospital', tiers: [1, 10, 25, 50] },
  { id: 'visits', sticker: 'doctor', tiers: [1, 5, 10, 25] },
  { id: 'goals', sticker: 'idea', tiers: [1, 10, 25, 50, 100] },
  { id: 'challenges', sticker: 'gift', tiers: [1, 3, 5, 10, 20] },
  { id: 'years', sticker: 'anniversary', tiers: [1, 2, 3, 4, 5, 10] },
  { id: 'calm', sticker: 'plants', tiers: [7, 30, 90, 180, 365, 730], ibd: true },
  { id: 'calmStreak', sticker: 'vacation', tiers: [7, 30, 60, 90, 180, 365], ibd: true },
  { id: 'bathroom', sticker: 'home', tiers: [1, 100, 500, 1000], ibd: true },
];

export interface Badge {
  id: string; // `${family}-${tier}`
  family: BadgeFamily;
  tier: number;
  level: number; // 0.. (index in the tiers: ring colour)
  earned: ISODate | null;
  progress: number; // current count
}

/** Every badge with the date it was earned (worked out from the logs). */
export function badges(all: HealthItem[], today: ISODate, ibd: boolean, weekStart: 0 | 1): Badge[] {
  const datesWithData = new Set<string>();
  for (const x of all) {
    const d = (x as { date?: string }).date;
    if (d && d <= today) datesWithData.add(d);
  }
  const first = [...datesWithData].sort()[0];
  const counts: Record<string, number> = {};
  const reached: Record<string, ISODate> = {};
  const bump = (fam: string, date: ISODate, n = 1, set = false) => {
    counts[fam] = set ? n : (counts[fam] ?? 0) + n;
    const f = BADGE_FAMILIES.find((x) => x.id === fam)!;
    for (const t of f.tiers) if (counts[fam] >= t && !reached[`${fam}-${t}`]) reached[`${fam}-${t}`] = date;
  };
  const runs: Record<string, number> = {};
  const run = (fam: string, ok: boolean, date: ISODate) => {
    runs[fam] = ok ? (runs[fam] ?? 0) + 1 : 0;
    if ((runs[fam] ?? 0) > (counts[fam] ?? 0)) bump(fam, date, runs[fam], true);
  };
  if (first) {
    const ix = indexOf(all);
    const per = (list: { date: ISODate }[]) => list.reduce((m, x) => m.set(x.date, (m.get(x.date) ?? 0) + 1), new Map<ISODate, number>());
    const testsBy = per(healthOf(all, 'test').filter((x) => ibd || !x.ibd));
    const visitsBy = per(healthOf(all, 'visit'));
    for (let d = dayNum(first); d <= dayNum(today); d++) {
      const date = fromDayNum(d);
      if (!datesWithData.has(date)) {
        // A day with nothing logged breaks streaks.
        for (const k of ['waterStreak', 'medsStreak', 'sleepStreak', 'calmStreak']) runs[k] = 0;
        continue;
      }
      const f = dayFacts(all, date, ibd);
      if (f.any) bump('logged', date);
      if (f.waterMet) bump('water', date);
      run('waterStreak', f.waterMet, date);
      if (f.medsAll) bump('meds', date);
      if (f.doses) run('medsStreak', f.medsAll, date);
      if (f.checkinFull) bump('checkin', date);
      if ((f.sleepH ?? 0) >= 7) bump('sleep', date);
      run('sleepStreak', (f.sleepH ?? 0) >= 7, date);
      if (f.exerciseMin >= 30) bump('move', date);
      if (f.steps >= 10000) bump('steps', date);
      if (f.weighed) bump('weigh', date);
      if ((f.mood ?? 0) >= 4) bump('mood', date);
      if (f.wake && f.wake < '07:00') bump('early', date);
      if (f.food) bump('food', date);
      if (ibd) {
        const s = ibdOn(all, date);
        if (s && !s.flare) bump('calm', date);
        run('calmStreak', !!s && !s.flare, date);
        const n = ix.bathroom.get(date)?.length ?? 0;
        if (n) bump('bathroom', date, n);
      }
      const tests = testsBy.get(date) ?? 0;
      if (tests) bump('tests', date, tests);
      const visits = visitsBy.get(date) ?? 0;
      if (visits) bump('visits', date, visits);
      // Whole years since the first log.
      const years = Math.floor((d - dayNum(first)) / 365.25);
      if (years > 0) bump('years', date, years, true);
    }
    for (const date of goalsCompleted(all, weekStart).dates) bump('goals', date);
    for (const c of healthOf(all, 'challenge')) {
      const r = challengeDays(all, c, today, ibd);
      if (r.done) bump('challenges', r.days[6].date);
    }
  }
  const out: Badge[] = [];
  for (const f of BADGE_FAMILIES) {
    if (f.ibd && !ibd) continue;
    f.tiers.forEach((tier, level) => out.push({ id: `${f.id}-${tier}`, family: f, tier, level, earned: reached[`${f.id}-${tier}`] ?? null, progress: counts[f.id] ?? 0 }));
  }
  return out;
}

// ---------------------------------------------------------------- water nudges
//
// Spread drinks evenly over the waking day, about one glass at a time (the
// kidneys clear at most ~0.8-1 L of water an hour, so sipping through the day
// is better than a lot at once), and drink less near bedtime (fewer night
// trips). A nudge comes only when you're about a glass behind that even pace.
// Interval = glass / (goal / waking hours), kept between 45 min and 3 h.

export interface NudgePlan {
  start: number; // minutes after midnight
  end: number;
  intervalMin: number;
  slots: number[]; // minutes after midnight of the plan's day (1440 = midnight at its end)
}

const toMin = (x: string) => +x.slice(0, 2) * 60 + +x.slice(3, 5);

/**
 * Water nudges between `from` and `to` (owner, Nov 2026: 09:00 to 00:00 by
 * default, changeable in Settings > Health). `to` at or before `from` = the
 * next day (00:00 = midnight).
 */
export function nudgePlan(goalMl: number, glassMl: number, from = '09:00', to = '00:00'): NudgePlan {
  const start = toMin(from);
  let end = toMin(to);
  if (end <= start) end += 1440;
  end = Math.min(end, start + 1439);
  const glasses = Math.max(1, Math.ceil(goalMl / Math.max(100, glassMl)));
  const intervalMin = Math.round(Math.min(180, Math.max(45, (end - start) / glasses)));
  const slots: number[] = [];
  for (let t = start + intervalMin; t <= end; t += intervalMin) slots.push(t);
  return { start, end, intervalMin, slots };
}

/** Is the person at least half a glass behind the even pace at minute `t`? */
export function behindPace(plan: NudgePlan, goalMl: number, glassMl: number, drankMl: number, t: number): boolean {
  const span = plan.end - plan.start;
  const elapsed = Math.min(span, Math.max(0, (t - plan.start + 1440) % 1440));
  const expected = (goalMl * elapsed) / span;
  return drankMl < goalMl && expected - drankMl >= glassMl / 2;
}

// ---------------------------------------------------------------- doctor report

export interface ReportWeek {
  start: ISODate;
  end: ISODate;
  days: number; // days in the range that fall in this week
  logged: number; // days with IBD data
  stoolsPerDay: number | null;
  loosePerDay: number | null;
  bloodDays: number;
  wellbeing: number | null; // 0 very well .. 4 terrible
  pain: number | null; // 0..3
  fatigue: number | null; // 0..3
  flareDays: number;
  score: number | null;
  water: number | null;
  sleep: number | null;
  mood: number | null;
}

export interface ReportData {
  from: ISODate;
  to: ISODate;
  daysLogged: number;
  weeks: ReportWeek[];
  daily: { date: ISODate; stools: number; loose: number; blood: number; flare: boolean }[];
  symptoms: { id: string; first: ISODate; days: number }[];
  flareRanges: { from: ISODate; to: ISODate }[];
  flareDays: number;
  stoolsPerDay: number | null;
  meds: { id: string; planned: number; taken: number }[];
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Everything the doctor report shows, for an inclusive date range. Weeks follow the calendar's week start. */
export function reportData(all: HealthItem[], from: ISODate, to: ISODate, ibd: boolean, weekStart: 0 | 1): ReportData {
  const ix = indexOf(all);
  const dates: ISODate[] = [];
  for (let d = dayNum(from); d <= dayNum(to); d++) dates.push(fromDayNum(d));
  const daily: ReportData['daily'] = [];
  const symptoms = new Map<string, { first: ISODate; days: number }>();
  const weeks = new Map<ISODate, { dates: ISODate[]; ibdDays: ISODate[] }>();
  for (const date of dates) {
    const dow = new Date(dayNum(date) * 86400000).getUTCDay();
    const ws = fromDayNum(dayNum(date) - ((dow - weekStart + 7) % 7));
    const w = weeks.get(ws) ?? { dates: [], ibdDays: [] };
    w.dates.push(date);
    if (ibd) {
      const st = bathroomStats(ix.bathroom.get(date) ?? [], date);
      const s = ibdOn(all, date);
      if (s) w.ibdDays.push(date);
      if (st.total || s) daily.push({ date, stools: st.total, loose: st.liquid, blood: st.blood, flare: !!s?.flare });
      for (const c of ix.ibdday.get(date)?.complications ?? []) {
        const cur = symptoms.get(c);
        symptoms.set(c, { first: cur?.first ?? date, days: (cur?.days ?? 0) + 1 });
      }
    }
    weeks.set(ws, w);
  }
  const out: ReportWeek[] = [];
  for (const [start, w] of weeks) {
    const facts = w.dates.map((d) => dayFacts(all, d, ibd));
    const ibdDays = w.ibdDays;
    const stats = ibdDays.map((d) => bathroomStats(ix.bathroom.get(d) ?? [], d));
    const days = ibdDays.map((d) => ix.ibdday.get(d)).filter((x): x is HealthIbdDay => !!x);
    out.push({
      start,
      end: fromDayNum(dayNum(start) + 6),
      days: w.dates.length,
      logged: ibdDays.length,
      stoolsPerDay: avg(stats.map((s) => s.total)),
      loosePerDay: avg(stats.map((s) => s.liquid)),
      bloodDays: stats.filter((s) => s.blood > 0).length,
      wellbeing: avg(days.filter((d) => d.wellbeing != null).map((d) => d.wellbeing!)),
      pain: avg(days.filter((d) => d.pain != null).map((d) => d.pain!)),
      fatigue: avg(days.filter((d) => d.fatigue != null).map((d) => d.fatigue!)),
      flareDays: ibdDays.filter((d) => ibdOn(all, d)?.flare).length,
      score: avg(ibdDays.map((d) => ibdOn(all, d)?.score ?? 0)),
      water: avg(facts.filter((f) => f.waterMl > 0).map((f) => f.waterMl)),
      sleep: avg(facts.filter((f) => f.sleepH != null).map((f) => f.sleepH!)),
      mood: avg(facts.filter((f) => f.mood != null).map((f) => f.mood!)),
    });
  }
  // Flare days joined into ranges (e.g. 12-16 Nov).
  const flareRanges: { from: ISODate; to: ISODate }[] = [];
  for (const d of daily.filter((x) => x.flare).map((x) => x.date)) {
    const last = flareRanges[flareRanges.length - 1];
    if (last && dayNum(d) - dayNum(last.to) === 1) last.to = d;
    else flareRanges.push({ from: d, to: d });
  }
  const planned = new Map<string, { planned: number; taken: number }>();
  for (const date of dates) {
    for (const x of dosesOn(ix.meds, ix.taken.get(date) ?? [], date)) {
      const cur = planned.get(x.med.id) ?? { planned: 0, taken: 0 };
      cur.planned++;
      if (x.taken) cur.taken++;
      planned.set(x.med.id, cur);
    }
  }
  return {
    from,
    to,
    daysLogged: dates.filter((d) => dayFacts(all, d, ibd).any).length,
    weeks: out,
    daily,
    symptoms: [...symptoms.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.first.localeCompare(b.first)),
    flareRanges,
    flareDays: daily.filter((x) => x.flare).length,
    stoolsPerDay: avg(daily.map((x) => x.stools)),
    meds: [...planned.entries()].map(([id, v]) => ({ id, ...v })),
  };
}

// ---------------------------------------------------------------- IBD history lines

export type IbdMetric = 'overall' | 'pain' | 'feeling' | 'tired' | 'flare';

/**
 * One point per logged day for the IBD history line chart (higher = worse
 * for every line). pain / tiredness 0-3, feeling 0 (very well) - 4
 * (terrible), flare = the day's HBI / SCCAI score. "overall" is the average
 * of whatever was logged that day, each scaled to 0-1 (score: HBI / 16 =
 * severe, SCCAI / 12, capped), shown 0-10.
 */
export function ibdSeries(all: HealthItem[], metric: IbdMetric, from: ISODate, to: ISODate): { date: ISODate; value: number }[] {
  const dates = new Set<ISODate>();
  for (const x of all) if (!x.deletedAt && (x.kind === 'ibdday' || x.kind === 'bathroom') && x.date >= from && x.date <= to) dates.add(x.date);
  const ix = indexOf(all);
  const out: { date: ISODate; value: number }[] = [];
  for (const date of [...dates].sort()) {
    const day = ix.ibdday.get(date);
    const s = ibdOn(all, date);
    let v: number | null = null;
    if (metric === 'pain') v = day?.pain ?? null;
    else if (metric === 'feeling') v = day?.wellbeing ?? null;
    else if (metric === 'tired') v = day?.fatigue ?? null;
    else if (metric === 'flare') v = s ? s.score : null;
    else {
      const parts = [
        day?.pain != null ? day.pain / 3 : null,
        day?.wellbeing != null ? day.wellbeing / 4 : null,
        day?.fatigue != null ? day.fatigue / 3 : null,
        s ? Math.min(1, s.score / (s.kind === 'uc' ? 12 : 16)) : null,
      ].filter((p): p is number => p != null);
      v = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) / 10 : null;
    }
    if (v != null) out.push({ date, value: v });
  }
  return out;
}

/** Where a flare starts on the score line: HBI 8 (moderate), SCCAI 5 (active). */
export const flareLine = (kind: 'hbi' | 'uc') => (kind === 'uc' ? 5 : 8);

// ---------------------------------------------------------------- food history line

export type FoodMetric = 'kcal' | 'carbs' | 'fat' | 'protein';

/** Daily totals (meals + snacks + drinks) for days that have that number logged. */
export function foodSeries(all: HealthItem[], metric: FoodMetric, from: ISODate, to: ISODate): { date: ISODate; value: number }[] {
  const by = new Map<ISODate, number>();
  for (const x of all) {
    if (x.kind !== 'food' || x.deletedAt || x.date < from || x.date > to) continue;
    const v = x[metric];
    if (v == null) continue;
    by.set(x.date, (by.get(x.date) ?? 0) + v);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, value: Math.round(v * 10) / 10 }));
}
