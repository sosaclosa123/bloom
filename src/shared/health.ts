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
    pregnancy: null,
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
// Base: about 35 ml of drinks per kg of body weight a day (common clinical
// rule of thumb, in line with EFSA 2010 / US NAM 2004 adequate intakes:
// total water ~2.0 L/day for women and ~2.5 L/day for men, ~70-80% of it from
// drinks). Without a weight we use those EFSA drink amounts.
// + ~500 ml per hour of exercise (ACSM fluid replacement guidance, rounded)
// + ~500 ml on hot days
// + 300 ml when pregnant, 700 ml when breastfeeding (EFSA 2010)
// IBD: + 500 ml with an ostomy or J-pouch, + 200 ml per liquid stool above
// the usual number (diarrhoea / high output loses fluid), up to + 1 L.
// Clamped to 1.5-4.5 L. A doctor's fluid limit (kidney/heart) always wins.

export type WaterPartKey = 'weight' | 'base' | 'exercise' | 'hot' | 'pregnant' | 'breastfeeding' | 'ostomy' | 'diarrhoea' | 'limit';
export interface WaterPart {
  key: WaterPartKey;
  ml: number;
  /** e.g. kg for 'weight', minutes for 'exercise', stools for 'diarrhoea'. */
  n?: number;
}
export interface WaterGoal {
  ml: number;
  parts: WaterPart[];
  /** Following the doctor's limit. */
  limited: boolean;
  /** Has a fluid-limiting condition but no limit set yet. */
  needsLimit: boolean;
}

/** Typical exercise minutes per activity level (used when minutes aren't given). */
export const ACTIVITY_MINUTES = { sedentary: 0, light: 20, active: 45, very: 75 } as const;

const round50 = (n: number) => Math.round(n / 50) * 50;

export function waterGoal(
  p: Partial<HealthProfile> | null | undefined,
  day: { date: ISODate; exerciseMin?: number | null; liquidStools?: number; weightKg?: number | null; ibd?: boolean },
): WaterGoal {
  const parts: WaterPart[] = [];
  if (p?.fluidLimit && p.fluidLimitMl && p.fluidLimitMl > 0) {
    return { ml: round50(p.fluidLimitMl), parts: [{ key: 'limit', ml: round50(p.fluidLimitMl) }], limited: true, needsLimit: false };
  }
  const kg = day.weightKg ?? p?.weightKg ?? null;
  if (kg && kg > 0) parts.push({ key: 'weight', ml: round50(35 * kg), n: kg });
  else parts.push({ key: 'base', ml: p?.sex === 'male' ? 2000 : p?.sex === 'female' ? 1600 : 1800 });

  const mins = day.exerciseMin ?? p?.exerciseMin ?? (p?.activity ? ACTIVITY_MINUTES[p.activity] : 0);
  if (mins > 0) parts.push({ key: 'exercise', ml: round50((mins / 60) * 500), n: mins });

  const month = Number(day.date.slice(5, 7)); // 1..12
  if (p?.hot === 'yes' || (p?.hot === 'summer' && month >= 5 && month <= 9)) parts.push({ key: 'hot', ml: 500 });

  if (p?.sex !== 'male' && p?.pregnancy === 'pregnant') parts.push({ key: 'pregnant', ml: 300 });
  if (p?.sex !== 'male' && p?.pregnancy === 'breastfeeding') parts.push({ key: 'breastfeeding', ml: 700 });

  if (day.ibd) {
    if (p?.ostomy === 'ostomy' || p?.ostomy === 'jpouch') parts.push({ key: 'ostomy', ml: 500 });
    const extra = Math.max(0, (day.liquidStools ?? 0) - (p?.ostomy === 'jpouch' ? (p?.typicalStools ?? 0) : 0));
    if (extra > 0) parts.push({ key: 'diarrhoea', ml: Math.min(1000, extra * 200), n: extra });
  }
  const sum = parts.reduce((a, x) => a + x.ml, 0);
  const ml = round50(Math.min(4500, Math.max(1500, sum)));
  return { ml, parts, limited: false, needsLimit: !!p?.fluidLimit };
}

// ---------------------------------------------------------------- BMI (WHO adult categories)

export type BmiCategory = 'under' | 'normal' | 'over' | 'obese';
export function bmi(heightCm: number | null | undefined, weightKg: number | null | undefined, age?: number | null): { value: number; cat: BmiCategory | null } | null {
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
  liquid: number; // Bristol 6-7
  blood: number;
  maxUrgency: number;
  maxPain: number;
}
export function bathroomStats(list: HealthBathroom[], date: ISODate): BathroomStats {
  const s: BathroomStats = { total: 0, liquid: 0, blood: 0, maxUrgency: 0, maxPain: 0 };
  for (const b of list) {
    if (b.deletedAt || b.date !== date) continue;
    s.total++;
    if (b.bristol >= 6) s.liquid++;
    if (b.blood) s.blood++;
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
// per complication. Bands: < 5 remission, 5-7 mild, 8-16 moderate, > 16 severe.

export const HBI_COMPLICATIONS = ['arthralgia', 'uveitis', 'erythema', 'aphthous', 'pyoderma', 'fissure', 'fistula', 'abscess'] as const;

export type ActivityLevel = 'remission' | 'mild' | 'moderate' | 'severe';

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

// ---------------------------------------------------------------- UC: simple partial Mayo-style score
//
// Patient-reported part of the Mayo score (Schroeder 1987; Lewis 2008 "partial
// Mayo"): stool frequency vs. normal (0 = normal, 1 = 1-2 more, 2 = 3-4 more,
// 3 = 5+ more) + rectal bleeding (0 none, 1 streaks < half the time,
// 2 obvious blood most of the time, 3 blood alone). 0-6 here:
// 0-1 remission, 2-3 mild, 4-5 moderate, 6 severe.

export function ucScore(stools: number, usual: number | null | undefined, bleeding: number): { score: number; level: ActivityLevel } {
  const more = Math.max(0, stools - (usual ?? 2));
  const freq = more === 0 ? 0 : more <= 2 ? 1 : more <= 4 ? 2 : 3;
  const score = freq + Math.max(0, Math.min(3, bleeding));
  const level: ActivityLevel = score <= 1 ? 'remission' : score <= 3 ? 'mild' : score <= 5 ? 'moderate' : 'severe';
  return { score, level };
}

/** Bleeding sub-score from the bathroom log (0 none, 1 under half the visits, 2 most visits). */
export function bleedingFromLog(s: BathroomStats): number {
  if (!s.blood) return 0;
  return s.blood / Math.max(1, s.total) < 0.5 ? 1 : 2;
}

/** A day's IBD activity: HBI for Crohn's (and unsure), partial Mayo for UC. */
export function ibdDayScore(
  profile: Partial<HealthProfile> | undefined,
  day: HealthIbdDay | undefined,
  stats: BathroomStats,
): { score: number; level: ActivityLevel; kind: 'hbi' | 'uc'; any: boolean } {
  const any = !!day || stats.total > 0;
  if (profile?.ibdType === 'uc') {
    const r = ucScore(stats.total, profile.typicalStools, day?.bleeding ?? bleedingFromLog(stats));
    return { ...r, kind: 'uc', any };
  }
  const r = hbi({ ...day, liquidStools: day?.liquidStools ?? stats.liquid });
  return { score: r.score, level: r.level, kind: 'hbi', any };
}

/** A flare day: marked as flare / mild flare, or the score is mild or worse. */
export function isFlareDay(day: HealthIbdDay | undefined, level: ActivityLevel): 'flare' | 'mild' | null {
  if (day?.flare === 'flare' || level === 'moderate' || level === 'severe') return 'flare';
  if (day?.flare === 'mild' || level === 'mild') return 'mild';
  return null;
}

// ---------------------------------------------------------------- medications

/** Doses planned for a date, with whether each was taken. */
export function dosesOn(meds: HealthMed[], taken: HealthMedTaken[], date: ISODate): { med: HealthMed; time: string; taken: HealthMedTaken | undefined }[] {
  const out: { med: HealthMed; time: string; taken: HealthMedTaken | undefined }[] = [];
  for (const m of meds) {
    if (m.deletedAt || !m.active) continue;
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
