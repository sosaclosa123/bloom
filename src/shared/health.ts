// Health: pure helpers and formulas (no DOM). Shown as guidance and trends,
// never as a diagnosis. Sources are noted next to each formula.
import type {
  HealthBathroom,
  HealthBody,
  HealthCheckin,
  HealthIbdDay,
  HealthItem,
  HealthMed,
  HealthMedTaken,
  HealthProfile,
  ISODate,
  Snapshot,
  SyncMeta,
} from './types';

// ---------------------------------------------------------------- picking records

type OfKind<K extends HealthItem['kind']> = Extract<HealthItem, { kind: K }>;

/** Live records of one kind. */
export function healthOf<K extends HealthItem['kind']>(all: HealthItem[], kind: K): OfKind<K>[] {
  return all.filter((x) => x.kind === kind && !x.deletedAt) as OfKind<K>[];
}

/** The newest live record of a kind for a date (one check-in / IBD day / body log per date). */
export function forDate<K extends 'checkin' | 'ibdday' | 'body'>(all: HealthItem[], kind: K, date: ISODate): OfKind<K> | undefined {
  let best: (SyncMeta & { date: ISODate }) | undefined;
  for (const x of healthOf(all, kind) as unknown as (SyncMeta & { date: ISODate })[]) if (x.date === date && (!best || x.updatedAt > best.updatedAt)) best = x;
  return best as OfKind<K> | undefined;
}

/** The person's profile (newest if two devices created one). */
export function profileOf(all: HealthItem[]): HealthProfile | undefined {
  let best: HealthProfile | undefined;
  for (const x of healthOf(all, 'profile')) if (!best || x.updatedAt > best.updatedAt) best = x;
  return best;
}

export function emptyProfile(): Omit<HealthProfile, keyof SyncMeta> {
  return {
    kind: 'profile',
    age: null,
    sex: null,
    heightCm: null,
    weightKg: null,
    activity: null,
    exerciseMin: null,
    hot: null,
    fluidLimit: null,
    fluidLimitMl: null,
    glassMl: 250,
    ibdType: null,
    ibdLocation: '',
    ibdMeds: '',
    ostomy: null,
    typicalStools: null,
    triggerFoods: '',
    done: false,
  };
}

/** Latest weight: newest body log on/before `date`, else the profile's. */
export function latestWeight(all: HealthItem[], date: ISODate): number | null {
  let best: HealthBody | undefined;
  for (const b of healthOf(all, 'body')) if (b.weightKg && b.date <= date && (!best || b.date > best.date || (b.date === best.date && b.updatedAt > best.updatedAt))) best = b;
  return best?.weightKg ?? profileOf(all)?.weightKg ?? null;
}

// ---------------------------------------------------------------- water goal
//
// A goal for DRINKS (water, tea, coffee, milk... all count), not total water.
// Base: EFSA 2010 adequate intakes of total water (EFSA Journal 8(3):1459) at
// moderate temperature and activity: 2.0 L/day women, 2.5 L/day men (age 14+);
// children 4-8 y 1.6 L, 9-13 y 1.9 L girls / 2.1 L boys. About 80% of that
// comes from drinks (EFSA), so the drink goal is 1.6 L women, 2.0 L men,
// 1.3 L age 4-8, 1.5 / 1.7 L age 9-13. (NHS: 6-8 glasses = ~1.5-2 L.)
// Body weight is NOT used: "35 ml per kg" is a fitness rule of thumb, not an
// official guideline, and gives far too much for larger bodies.
// + Exercise: sweat losses vary a lot (ACSM 2007: replace losses, water is
//   enough under 90 min); we add ~500 ml per hour of exercise, at most 1 L.
//   Minutes come from the day's log, else the profile, else the activity
//   level ('active' ~30 min/day = WHO 150 min/week, 'very' ~60 min/day).
// + Hot weather: EFSA values are for moderate temperatures; + ~500 ml.
// IBD (only when IBD is on):
// + Ileostomy or J-pouch: + 500 ml (extra losses). Part of it should be an
//   oral rehydration solution; with a HIGH-output stoma, more plain water
//   makes it worse (BAPEN / NHS high-output stoma guidance) - see the notes.
//   Colostomy: no extra.
// + Loose stools (Bristol 6-7) on that day: + 200 ml each, at most + 1 L
//   (ideally as oral rehydration solution). Not counted with an ileostomy.
// Clamped to 1.2-3.5 L. A doctor's fluid limit (kidney/heart) always wins.

export type WaterPartKey = 'base' | 'exercise' | 'hot' | 'ostomy' | 'diarrhoea' | 'limit';
export interface WaterPart {
  key: WaterPartKey;
  ml: number;
  /** minutes for 'exercise', stools for 'diarrhoea'. */
  n?: number;
}
export type WaterNote = 'ors' | 'stoma';
export interface WaterGoal {
  ml: number;
  parts: WaterPart[];
  /** Following the doctor's limit. */
  limited: boolean;
  /** Has a fluid-limiting condition but no limit set yet. */
  needsLimit: boolean;
  /** Extra advice to show: oral rehydration solution, high-output stoma. */
  notes: WaterNote[];
}

/** Exercise minutes a day assumed from the activity level (when minutes aren't given). */
export const ACTIVITY_MINUTES = { sedentary: 0, light: 0, active: 30, very: 60 } as const;

const round50 = (n: number) => Math.round(n / 50) * 50;

/** EFSA-based drink amount for age and sex (see above). */
export function baseDrinksMl(sex: HealthProfile['sex'] | undefined, age: number | null | undefined): number {
  if (age != null && age < 9) return 1300;
  if (age != null && age < 14) return sex === 'male' ? 1700 : sex === 'female' ? 1500 : 1600;
  return sex === 'male' ? 2000 : sex === 'female' ? 1600 : 1800;
}

export function waterGoal(
  p: Partial<HealthProfile> | null | undefined,
  day: { date: ISODate; exerciseMin?: number | null; liquidStools?: number; ibd?: boolean },
): WaterGoal {
  const parts: WaterPart[] = [];
  const notes: WaterNote[] = [];
  if (p?.fluidLimit && p.fluidLimitMl && p.fluidLimitMl > 0) {
    return { ml: round50(p.fluidLimitMl), parts: [{ key: 'limit', ml: round50(p.fluidLimitMl) }], limited: true, needsLimit: false, notes };
  }
  parts.push({ key: 'base', ml: baseDrinksMl(p?.sex, p?.age) });

  const mins = day.exerciseMin ?? p?.exerciseMin ?? (p?.activity ? ACTIVITY_MINUTES[p.activity] : 0);
  if (mins > 0) parts.push({ key: 'exercise', ml: Math.min(1000, round50((mins / 60) * 500)), n: mins });

  const month = Number(day.date.slice(5, 7)); // 1..12
  if (p?.hot === 'yes' || (p?.hot === 'summer' && month >= 5 && month <= 9)) parts.push({ key: 'hot', ml: 500 });


  if (day.ibd) {
    const ileo = p?.ostomy === 'ostomy'; // 'ostomy' = ileostomy
    if (ileo || p?.ostomy === 'jpouch') {
      parts.push({ key: 'ostomy', ml: 500 });
      notes.push('stoma');
    }
    // Loose stools above the usual (a J-pouch normally gives a few loose ones).
    const extra = ileo ? 0 : Math.max(0, (day.liquidStools ?? 0) - (p?.ostomy === 'jpouch' ? (p?.typicalStools ?? 0) : 0));
    if (extra > 0) {
      parts.push({ key: 'diarrhoea', ml: Math.min(1000, extra * 200), n: extra });
      notes.push('ors');
    }
  }
  const sum = parts.reduce((a, x) => a + x.ml, 0);
  const ml = round50(Math.min(3500, Math.max(1200, sum)));
  return { ml, parts, limited: false, needsLimit: !!p?.fluidLimit, notes };
}

// ---------------------------------------------------------------- BMI (WHO adult categories)

export type BmiCategory = 'under' | 'normal' | 'over' | 'obese';
export function bmi(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
  age?: number | null,
): { value: number; cat: BmiCategory | null } | null {
  if (!heightCm || !weightKg || heightCm < 50 || weightKg < 10) return null;
  const m = heightCm / 100;
  const value = Math.round((weightKg / (m * m)) * 10) / 10;
  // WHO: < 18.5 underweight, 18.5-24.9 healthy, 25-29.9 overweight, >= 30 obesity.
  // Adult ranges only (under 18 uses growth charts, so no category).
  const cat: BmiCategory | null = age != null && age < 18 ? null : value < 18.5 ? 'under' : value < 25 ? 'normal' : value < 30 ? 'over' : 'obese';
  return { value, cat };
}

// ---------------------------------------------------------------- bathroom log (IBD)

export interface BathroomStats {
  total: number;
  /** Visits at night (woke up to go). */
  night: number;
  liquid: number; // Bristol 6-7
  /** Visits with any blood / with obvious blood. */
  blood: number;
  frank: number;
  maxUrgency: number; // 0 none, 1 had to hurry, 2 right away, 3 didn't make it
  maxPain: number;
}

/** Blood level of a visit: 0 none, 1 a trace, 2 obvious (older records only had yes/no). */
export const bloodLevel = (b: HealthBathroom) => (b.bloodLevel ?? (b.blood ? 2 : 0));

/** A visit between 23:00 and 06:00 counts as at night unless marked otherwise. */
export const isNightTime = (time: string) => time >= '23:00' || time < '06:00';

export function bathroomStats(list: HealthBathroom[], date: ISODate): BathroomStats {
  const s: BathroomStats = { total: 0, night: 0, liquid: 0, blood: 0, frank: 0, maxUrgency: 0, maxPain: 0 };
  for (const b of list) {
    if (b.deletedAt || b.date !== date) continue;
    s.total++;
    if (b.night ?? isNightTime(b.time)) s.night++;
    if (b.bristol >= 6) s.liquid++;
    const bl = bloodLevel(b);
    if (bl > 0) s.blood++;
    if (bl >= 2) s.frank++;
    s.maxUrgency = Math.max(s.maxUrgency, b.urgency);
    s.maxPain = Math.max(s.maxPain, b.pain);
  }
  return s;
}

// ---------------------------------------------------------------- Crohn's: Harvey-Bradshaw Index
//
// Harvey RF, Bradshaw JM. "A simple index of Crohn's-disease activity."
// Lancet 1980;1(8178):514. Daily items: general well-being (0-4), abdominal
// pain (0-3), number of liquid/soft stools, abdominal mass (0-3), and 1 point
// per complication. Bands: < 5 remission, 5-7 mild, 8-16 moderate, > 16 severe
// (Best 1998; Vermeire 2010). The "abdominal mass" item is normally found by
// a doctor's exam, so it is only counted when entered. Not validated with an
// ileostomy (stool counts don't apply): the app then shows a note.

export const HBI_COMPLICATIONS = ['arthralgia', 'uveitis', 'erythema', 'aphthous', 'pyoderma', 'fissure', 'fistula', 'abscess'] as const;

export type ActivityLevel = 'remission' | 'mild' | 'moderate' | 'active' | 'severe';

export function hbi(d: Partial<Pick<HealthIbdDay, 'wellbeing' | 'pain' | 'mass' | 'complications'>> & { liquidStools?: number | null }): {
  score: number;
  level: ActivityLevel;
  complete: boolean;
} {
  const wb = d.wellbeing ?? 0;
  const pain = d.pain ?? 0;
  const mass = d.mass ?? 0;
  const stools = d.liquidStools ?? 0;
  const comp = (d.complications ?? []).length;
  const score = wb + pain + stools + mass + comp;
  const level: ActivityLevel = score < 5 ? 'remission' : score <= 7 ? 'mild' : score <= 16 ? 'moderate' : 'severe';
  return { score, level, complete: d.wellbeing != null && d.pain != null && d.liquidStools != null };
}

// ---------------------------------------------------------------- UC: Simple Clinical Colitis Activity Index
//
// Walmsley RS et al. "A simple clinical colitis activity index." Gut
// 1998;43:29-32. Fully patient-reported, 0-19:
//  - bowel movements by day: 1-3 = 0, 4-6 = 1, 7-9 = 2, more than 9 = 3
//  - at night: none = 0, 1-3 = 1, 4-6 or more = 2
//  - urgency: none 0, hurry 1, immediately 2, incontinence 3
//  - blood: none 0, trace 1, occasionally frank 2, usually frank 3
//  - general well-being 0-4 (same scale as HBI)
//  - 1 point each: arthritis/joint pain, eye inflammation (uveitis),
//    erythema nodosum, pyoderma gangrenosum
// Remission: score <= 2 (Higgins 2005, Gut 54:782: SCCAI < 2.5 best matched
// patient-defined remission). Active disease: 5 or more (Walmsley; Jowett
// 2003). 3-4 is shown as "mild". There is no validated "severe" band.

export const SCCAI_EXTRACOLONIC = ['arthralgia', 'uveitis', 'erythema', 'pyoderma'] as const;

export function sccai(s: BathroomStats, d: Partial<Pick<HealthIbdDay, 'wellbeing' | 'complications'>> | undefined): { score: number; level: ActivityLevel } {
  const dayCount = s.total - s.night;
  const freqDay = dayCount <= 3 ? 0 : dayCount <= 6 ? 1 : dayCount <= 9 ? 2 : 3;
  const freqNight = s.night === 0 ? 0 : s.night <= 3 ? 1 : 2;
  const blood = s.frank === 0 ? (s.blood > 0 ? 1 : 0) : s.frank / Math.max(1, s.total) < 0.5 ? 2 : 3;
  const extra = (d?.complications ?? []).filter((c) => (SCCAI_EXTRACOLONIC as readonly string[]).includes(c)).length;
  const score = freqDay + freqNight + Math.min(3, s.maxUrgency) + blood + (d?.wellbeing ?? 0) + extra;
  const level: ActivityLevel = score <= 2 ? 'remission' : score <= 4 ? 'mild' : 'active';
  return { score, level };
}

/** A day's IBD activity: HBI for Crohn's (and unsure), SCCAI for UC. */
export function ibdDayScore(
  profile: Partial<HealthProfile> | undefined,
  day: HealthIbdDay | undefined,
  stats: BathroomStats,
): { score: number; level: ActivityLevel; kind: 'hbi' | 'uc'; any: boolean } {
  const any = !!day || stats.total > 0;
  if (profile?.ibdType === 'uc') return { ...sccai(stats, day), kind: 'uc', any };
  const r = hbi({ ...day, liquidStools: day?.liquidStools ?? stats.liquid });
  return { score: r.score, level: r.level, kind: 'hbi', any };
}

/** A flare day: marked as flare / mild flare, or the score is mild or worse. */
export function isFlareDay(day: HealthIbdDay | undefined, level: ActivityLevel): 'flare' | 'mild' | null {
  if (day?.flare === 'flare' || level === 'moderate' || level === 'active' || level === 'severe') return 'flare';
  if (day?.flare === 'mild' || level === 'mild') return 'mild';
  return null;
}

// ---------------------------------------------------------------- medications

/** Doses planned for a date, with whether each was taken. */
export function dosesOn(meds: HealthMed[], taken: HealthMedTaken[], date: ISODate): { med: HealthMed; time: string; taken: HealthMedTaken | undefined }[] {
  const out: { med: HealthMed; time: string; taken: HealthMedTaken | undefined }[] = [];
  for (const m of meds) {
    if (m.deletedAt || !m.active || !medDueOn(m, date)) continue;
    for (const time of [...m.times].sort()) {
      out.push({ med: m, time, taken: taken.find((x) => !x.deletedAt && x.medId === m.id && x.date === date && x.time === time) });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

// ---------------------------------------------------------------- check-in helpers

export function checkinFilled(c: HealthCheckin | undefined): number {
  if (!c) return 0;
  return [c.waterMl > 0, c.mood != null, c.sleepH != null, c.energy != null, c.stress != null].filter(Boolean).length;
}

// ---------------------------------------------------------------- trends & food insights

/** IBD score for each date that has any IBD data. */
export function ibdScores(all: HealthItem[], profile: Partial<HealthProfile> | undefined, dates: ISODate[]): Map<ISODate, { score: number; level: ActivityLevel; flare: 'flare' | 'mild' | null }> {
  const log = healthOf(all, 'bathroom');
  const out = new Map<ISODate, { score: number; level: ActivityLevel; flare: 'flare' | 'mild' | null }>();
  for (const date of dates) {
    const day = forDate(all, 'ibdday', date);
    const r = ibdDayScore(profile, day, bathroomStats(log, date));
    if (r.any) out.set(date, { score: r.score, level: r.level, flare: isFlareDay(day, r.level) });
  }
  return out;
}

/** Common food tags (the person can add their own). */
export const FOOD_TAGS = ['dairy', 'gluten', 'spicy', 'fried', 'fatty', 'sugar', 'alcohol', 'caffeine', 'fiber', 'redmeat'] as const;

export interface FoodInsight {
  tag: string;
  withAvg: number;
  withoutAvg: number;
  withDays: number;
  worse: boolean;
}

/**
 * Simple counts, no statistics: for each food tag, the average IBD score on
 * days the food was eaten vs. days it wasn't (both need at least `minDays`).
 * Only differences of at least 1.5 points are reported, biggest first.
 */
export function foodInsights(all: HealthItem[], profile: Partial<HealthProfile> | undefined, dates: ISODate[], minDays = 3): FoodInsight[] {
  const scores = ibdScores(all, profile, dates);
  const tagsByDate = new Map<ISODate, Set<string>>();
  for (const f of healthOf(all, 'food')) {
    if (!scores.has(f.date)) continue;
    const set = tagsByDate.get(f.date) ?? new Set<string>();
    f.tags.forEach((x) => set.add(x));
    tagsByDate.set(f.date, set);
  }
  // Only days with both a food log and a score count.
  const days = [...tagsByDate.keys()];
  const tags = new Set(days.flatMap((d) => [...tagsByDate.get(d)!]));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const out: FoodInsight[] = [];
  for (const tag of tags) {
    const w = days.filter((d) => tagsByDate.get(d)!.has(tag)).map((d) => scores.get(d)!.score);
    const wo = days.filter((d) => !tagsByDate.get(d)!.has(tag)).map((d) => scores.get(d)!.score);
    if (w.length < minDays || wo.length < minDays) continue;
    const a = avg(w);
    const b = avg(wo);
    if (Math.abs(a - b) < 1.5) continue;
    out.push({ tag, withAvg: Math.round(a * 10) / 10, withoutAvg: Math.round(b * 10) / 10, withDays: w.length, worse: a > b });
  }
  return out.sort((x, y) => Math.abs(y.withAvg - y.withoutAvg) - Math.abs(x.withAvg - x.withoutAvg));
}

// ---------------------------------------------------------------- startup "Coming up" window

/**
 * Health in the startup window: only when Health is on for this computer,
 * and only today's medication doses still to take (generic "Medication",
 * label null, unless medicine names were turned on). No IBD items here.
 */
export function glanceDoses(snap: Pick<Snapshot, 'settings' | 'health'>, now: Date): { label: string | null; time: string }[] {
  if (!snap.settings.healthEnabled) return [];
  const all = snap.health ?? [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return dosesOn(healthOf(all, 'med'), healthOf(all, 'taken'), today)
    .filter((d) => !d.taken && d.time >= hhmm)
    .map((d) => ({ label: snap.settings.healthMedNames ? d.med.name : null, time: d.time }));
}

// ---------------------------------------------------------------- medication schedule

const dayNum = (d: ISODate) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
const fromDayNum = (n: number): ISODate => new Date(n * 86400000).toISOString().slice(0, 10);

/** Is this medicine due on `date`? (every N days / weeks / months from its start; default daily) */
export function medDueOn(m: Pick<HealthMed, 'every' | 'unit' | 'startDate'>, date: ISODate): boolean {
  const every = Math.max(1, m.every ?? 1);
  const unit = m.unit ?? 'day';
  if (unit === 'day' && every === 1) return true;
  const start = m.startDate ?? date;
  if (date < start) return false;
  if (unit === 'month') {
    const months = (+date.slice(0, 4) - +start.slice(0, 4)) * 12 + (+date.slice(5, 7) - +start.slice(5, 7));
    if (months % every) return false;
    // Same day of month (short months: last day).
    const last = new Date(+date.slice(0, 4), +date.slice(5, 7), 0).getDate();
    return +date.slice(8, 10) === Math.min(+start.slice(8, 10), last);
  }
  const step = every * (unit === 'week' ? 7 : 1);
  return (dayNum(date) - dayNum(start)) % step === 0;
}

/** The next date (from `from`, inclusive) this medicine is due, within ~2 years. */
export function nextMedDate(m: Pick<HealthMed, 'every' | 'unit' | 'startDate'>, from: ISODate): ISODate | null {
  const f = dayNum(from);
  for (let i = 0; i < 800; i++) {
    const d = fromDayNum(f + i);
    if (medDueOn(m, d)) return d;
  }
  return null;
}

// ---------------------------------------------------------------- sleep from bed / wake times

/** Hours between bed and wake time (over midnight), rounded to 0.25 h. */
export function sleepFromTimes(bed: string, wake: string): number | null {
  const m = (x: string) => (/^\d\d:\d\d$/.test(x) ? +x.slice(0, 2) * 60 + +x.slice(3) : null);
  const b = m(bed);
  const w = m(wake);
  if (b == null || w == null) return null;
  const mins = (w - b + 1440) % 1440;
  return mins === 0 ? null : Math.round((mins / 60) * 4) / 4;
}

export { dayNum, fromDayNum };
