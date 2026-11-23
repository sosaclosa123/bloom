import { describe, expect, it } from 'vitest';
import { alertsDueBetween } from './alerts';
import { newMeta } from './db';
import { bathroomStats, bmi, dosesOn, emptyProfile, foodInsights, forDate, glanceDoses, hbi, ibdDayScore, ibdScores, isFlareDay, latestWeight, profileOf, sccai, waterGoal, type BathroomStats } from './health';
import { DEFAULT_SETTINGS, type HealthBathroom, type HealthItem, type HealthMed, type HealthMedTaken, type HealthProfile } from './types';

const prof = (p: Partial<HealthProfile>): HealthProfile => ({ ...newMeta(), ...emptyProfile(), ...p });
const bath = (date: string, bristol: number, extra: Partial<HealthBathroom> = {}): HealthBathroom => ({
  ...newMeta(),
  kind: 'bathroom',
  date,
  time: '08:00',
  bristol,
  urgency: 0,
  blood: false,
  pain: 0,
  notes: '',
  ...extra,
});

describe('water goal (drinks)', () => {
  const D = { date: '2026-01-10' };
  it('uses EFSA drink amounts (80% of the adequate total water intake), not body weight', () => {
    expect(waterGoal(prof({ sex: 'female', weightKg: 60 }), D)).toMatchObject({ ml: 1600, parts: [{ key: 'base', ml: 1600 }] });
    expect(waterGoal(prof({ sex: 'male', weightKg: 110 }), D).ml).toBe(2000);
    expect(waterGoal(null, D).ml).toBe(1800);
  });
  it('uses EFSA child values under 14', () => {
    expect(waterGoal(prof({ sex: 'female', age: 7 }), D).ml).toBe(1300);
    expect(waterGoal(prof({ sex: 'male', age: 12 }), D).ml).toBe(1700);
    expect(waterGoal(prof({ sex: 'female', age: 14 }), D).ml).toBe(1600);
  });
  it('adds exercise and hot days', () => {
    const g = waterGoal(prof({ sex: 'female', exerciseMin: 60, hot: 'summer' }), { date: '2026-07-10' });
    expect(g.ml).toBe(1600 + 500 + 500);
    // Summer heat only counts in summer months; the day's logged exercise wins over the usual.
    expect(waterGoal(prof({ sex: 'female', exerciseMin: 60, hot: 'summer' }), { date: '2026-01-10', exerciseMin: 30 }).ml).toBe(1600 + 250);
    // Exercise adds at most 1 L.
    expect(waterGoal(prof({ sex: 'male', exerciseMin: 240 }), D).ml).toBe(3000);
  });
  it('uses the activity level when minutes are not given (WHO ~150 min/week = active)', () => {
    expect(waterGoal(prof({ activity: 'active' }), D).parts.find((p) => p.key === 'exercise')?.n).toBe(30);
    expect(waterGoal(prof({ activity: 'light' }), D).parts.find((p) => p.key === 'exercise')).toBeUndefined();
  });
  it("the owner's case is no longer ~4 L", () => {
    const g = waterGoal(prof({ sex: 'male', weightKg: 85, exerciseMin: 60, hot: 'summer' }), { date: '2026-07-10' });
    expect(g.ml).toBe(3000);
    expect(waterGoal(prof({ sex: 'male', weightKg: 85, exerciseMin: 60, hot: 'summer' }), D).ml).toBe(2500);
  });
  it('IBD: ileostomy / J-pouch extra with stoma advice; colostomy none; loose stools with ORS advice', () => {
    const ileo = waterGoal(prof({ sex: 'female', ostomy: 'ostomy' }), { ...D, liquidStools: 3, ibd: true });
    expect(ileo).toMatchObject({ ml: 2100, notes: ['stoma'] }); // stool counts don't apply with an ileostomy
    expect(waterGoal(prof({ sex: 'female', ostomy: 'colostomy' }), { ...D, ibd: true }).ml).toBe(1600);
    const loose = waterGoal(prof({ sex: 'female' }), { ...D, liquidStools: 3, ibd: true });
    expect(loose).toMatchObject({ ml: 2200, notes: ['ors'] });
    expect(waterGoal(prof({ sex: 'female' }), { ...D, liquidStools: 9, ibd: true }).ml).toBe(2600); // + at most 1 L
    expect(waterGoal(prof({ sex: 'female', ostomy: 'ostomy' }), { ...D, liquidStools: 3, ibd: false }).ml).toBe(1600);
  });
  it('clamps to 1.2-3.5 L', () => {
    expect(waterGoal(prof({ sex: 'male', exerciseMin: 180, hot: 'yes' }), D).ml).toBe(3500);
  });
  it("follows the doctor's fluid limit", () => {
    expect(waterGoal(prof({ sex: 'male', fluidLimit: true, fluidLimitMl: 1200 }), D)).toMatchObject({ ml: 1200, limited: true });
    expect(waterGoal(prof({ sex: 'male', fluidLimit: true }), D).needsLimit).toBe(true);
  });
});

describe('BMI', () => {
  it('uses WHO adult categories', () => {
    expect(bmi(170, 65)).toEqual({ value: 22.5, cat: 'normal' });
    expect(bmi(170, 50)?.cat).toBe('under');
    expect(bmi(170, 80)?.cat).toBe('over');
    expect(bmi(170, 90)?.cat).toBe('obese');
    expect(bmi(170, 65, 15)?.cat).toBeNull();
    expect(bmi(null, 65)).toBeNull();
  });
});

describe('Harvey-Bradshaw Index', () => {
  it('adds the items and bands the score', () => {
    expect(hbi({ wellbeing: 1, pain: 1, liquidStools: 2, mass: 0, complications: [] })).toEqual({ score: 4, level: 'remission', complete: true });
    expect(hbi({ wellbeing: 1, pain: 1, liquidStools: 3, mass: 0, complications: [] }).level).toBe('mild');
    expect(hbi({ wellbeing: 2, pain: 2, liquidStools: 3, mass: 0, complications: ['fissure'] }).level).toBe('moderate');
    expect(hbi({ wellbeing: 4, pain: 3, liquidStools: 8, mass: 2, complications: [] }).level).toBe('severe');
    expect(hbi({ pain: 1 }).complete).toBe(false);
  });
  it('counts liquid stools from the bathroom log', () => {
    const log = [bath('2026-01-10', 6), bath('2026-01-10', 7, { blood: true, urgency: 2 }), bath('2026-01-10', 4), bath('2026-01-11', 7)];
    const s = bathroomStats(log, '2026-01-10');
    expect(s).toMatchObject({ total: 3, liquid: 2, blood: 1, frank: 1, maxUrgency: 2, maxPain: 0 });
    const r = ibdDayScore(prof({ ibdType: 'crohns' }), undefined, s);
    expect(r).toMatchObject({ score: 2, kind: 'hbi', level: 'remission' });
  });
});

describe('UC: SCCAI (Walmsley 1998)', () => {
  const st = (p: Partial<BathroomStats>): BathroomStats => ({ total: 0, night: 0, liquid: 0, blood: 0, frank: 0, maxUrgency: 0, maxPain: 0, ...p });
  it('scores day/night frequency, urgency, blood, well-being and extra-intestinal problems', () => {
    expect(sccai(st({ total: 3 }), { wellbeing: 0 })).toEqual({ score: 0, level: 'remission' });
    // 5 by day (1) + 1 at night (1) + hurry (1) + trace (1) = 4 -> mild
    expect(sccai(st({ total: 6, night: 1, blood: 1, maxUrgency: 1 }), { wellbeing: 0 })).toEqual({ score: 4, level: 'mild' });
    // 8 by day (2) + 2 night (1) + right away (2) + frank most visits (3) + poor (2) + joint pain (1) = 11
    expect(sccai(st({ total: 10, night: 2, blood: 6, frank: 6, maxUrgency: 2 }), { wellbeing: 2, complications: ['arthralgia', 'fissure'] })).toEqual({ score: 11, level: 'active' });
    // frank blood in under half the visits = 2
    expect(sccai(st({ total: 3, blood: 1, frank: 1 }), {}).score).toBe(2);
  });
  it('counts night visits and blood levels from the log', () => {
    const log = [bath('2026-01-10', 4, { time: '02:00' }), bath('2026-01-10', 5, { time: '09:00', bloodLevel: 1, blood: true }), bath('2026-01-10', 6, { time: '23:30', night: false }), bath('2026-01-10', 7, { blood: true })];
    expect(bathroomStats(log, '2026-01-10')).toMatchObject({ total: 4, night: 1, blood: 2, frank: 1, liquid: 2 });
    expect(ibdDayScore(prof({ ibdType: 'uc' }), undefined, bathroomStats(log, '2026-01-10'))).toMatchObject({ kind: 'uc', score: 1 + 2, level: 'mild' });
  });
});

describe('flares', () => {
  it('marks mild+ days and manual flares', () => {
    expect(isFlareDay(undefined, 'remission')).toBeNull();
    expect(isFlareDay(undefined, 'mild')).toBe('mild');
    expect(isFlareDay(undefined, 'moderate')).toBe('flare');
    const day = { ...newMeta(), kind: 'ibdday' as const, date: '2026-01-10', wellbeing: 0, pain: 0, fatigue: 0, mass: 0, complications: [], liquidStools: 0, bleeding: 0, flare: 'flare' as const };
    expect(isFlareDay(day, 'remission')).toBe('flare');
  });
});

describe('records', () => {
  it('finds the newest profile / record for a date and the latest weight', () => {
    const a = { ...prof({ age: 30 }), updatedAt: 1 };
    const b = { ...prof({ age: 31 }), updatedAt: 2 };
    const all: HealthItem[] = [
      a,
      b,
      { ...newMeta(), kind: 'body', date: '2026-01-05', weightKg: 70, exerciseMin: null, steps: null },
      { ...newMeta(), kind: 'body', date: '2026-01-08', weightKg: 69, exerciseMin: null, steps: null },
      { ...newMeta(), kind: 'body', date: '2026-01-09', weightKg: null, exerciseMin: 30, steps: null },
    ];
    expect(profileOf(all)?.age).toBe(31);
    expect(latestWeight(all, '2026-01-10')).toBe(69);
    expect(latestWeight(all, '2026-01-06')).toBe(70);
    expect(forDate(all, 'body', '2026-01-09')?.exerciseMin).toBe(30);
  });
  it('lists doses with taken marks', () => {
    const med: HealthMed = { ...newMeta(), kind: 'med', name: 'B', dose: '1', times: ['20:00', '08:00'], remind: true, active: true, supplement: false };
    const off: HealthMed = { ...med, id: 'x', active: false };
    const taken: HealthMedTaken = { ...newMeta(), kind: 'taken', medId: med.id, date: '2026-01-10', time: '08:00' };
    const d = dosesOn([med, off], [taken], '2026-01-10');
    expect(d.map((x) => [x.time, !!x.taken])).toEqual([
      ['08:00', true],
      ['20:00', false],
    ]);
  });
});

describe('medication reminders', () => {
  const med: HealthMed = { ...newMeta(), kind: 'med', name: 'Humira', dose: '40 mg', times: ['08:00', '20:00'], remind: true, active: true, supplement: false };
  const at = (h: number, m = 0) => new Date(2026, 0, 10, h, m).getTime();
  const base = { events: [], reminders: [], settings: { ...DEFAULT_SETTINGS, healthEnabled: true } };
  it('fires at each time with a generic title by default', () => {
    const a = alertsDueBetween({ ...base, health: [med] }, at(7, 59), at(8, 0));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'med', title: '', when: '2026-01-10T08:00', sourceId: med.id });
    const named = alertsDueBetween({ ...base, settings: { ...base.settings, healthMedNames: true }, health: [med] }, at(7, 59), at(8, 0));
    expect(named[0].title).toBe('Humira · 40 mg');
  });
  it('stays quiet when Health is off, the dose was taken, or reminders are off', () => {
    expect(alertsDueBetween({ ...base, settings: DEFAULT_SETTINGS, health: [med] }, at(7, 59), at(8, 0))).toHaveLength(0);
    const taken: HealthMedTaken = { ...newMeta(), kind: 'taken', medId: med.id, date: '2026-01-10', time: '08:00' };
    expect(alertsDueBetween({ ...base, health: [med, taken] }, at(7, 59), at(8, 0))).toHaveLength(0);
    expect(alertsDueBetween({ ...base, health: [{ ...med, remind: false }] }, at(7, 59), at(8, 0))).toHaveLength(0);
    expect(alertsDueBetween({ ...base, health: [{ ...med, active: false }] }, at(7, 59), at(8, 0))).toHaveLength(0);
  });
  it('catches up over midnight', () => {
    const a = alertsDueBetween({ ...base, health: [med] }, at(19), at(32));
    expect(a.map((x) => x.when)).toEqual(['2026-01-10T20:00', '2026-01-11T08:00']);
  });
});

describe('food insights', () => {
  it('compares symptom scores on days with and without a food', () => {
    const all: HealthItem[] = [];
    const dates: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const date = `2026-01-${String(i).padStart(2, '0')}`;
      dates.push(date);
      const dairy = i % 2 === 0;
      all.push({ ...newMeta(), kind: 'food', date, time: '12:00', meal: 'lunch', text: '', tags: dairy ? ['dairy', 'gluten'] : ['gluten'] });
      all.push({ ...newMeta(), kind: 'ibdday', date, wellbeing: dairy ? 3 : 0, pain: dairy ? 2 : 0, fatigue: 0, mass: 0, complications: [], liquidStools: 0, bleeding: 0, flare: 'none' });
    }
    const r = foodInsights(all, prof({ ibdType: 'crohns' }), dates);
    expect(r).toEqual([{ tag: 'dairy', withAvg: 5, withoutAvg: 0, withDays: 5, worse: true }]);
    // gluten is every day: nothing to compare with
    expect(r.find((x) => x.tag === 'gluten')).toBeUndefined();
    // Too little data: nothing.
    expect(foodInsights(all, prof({}), dates.slice(0, 4))).toEqual([]);
    const s = ibdScores(all, prof({}), ['2026-01-02', '2026-01-03', '2026-02-01']);
    expect(s.get('2026-01-02')).toEqual({ score: 5, level: 'mild', flare: 'mild' });
    expect(s.has('2026-02-01')).toBe(false);
  });
});

describe('startup window', () => {
  it('shows only remaining doses, only when Health is on, generic by default', () => {
    const med: HealthMed = { ...newMeta(), kind: 'med', name: 'Humira', dose: '', times: ['08:00', '20:00', '22:00'], remind: true, active: true, supplement: false };
    const taken: HealthMedTaken = { ...newMeta(), kind: 'taken', medId: med.id, date: '2026-01-10', time: '20:00' };
    const now = new Date(2026, 0, 10, 9, 0);
    const on = { ...DEFAULT_SETTINGS, healthEnabled: true };
    expect(glanceDoses({ settings: on, health: [med, taken] }, now)).toEqual([{ label: null, time: '22:00' }]);
    expect(glanceDoses({ settings: { ...on, healthMedNames: true }, health: [med] }, now).map((d) => d.label)).toEqual(['Humira', 'Humira']);
    expect(glanceDoses({ settings: DEFAULT_SETTINGS, health: [med] }, now)).toEqual([]);
  });
});
