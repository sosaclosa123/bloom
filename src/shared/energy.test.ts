// Calorie + protein goal (sources in health.ts next to energyGoal).
import { describe, expect, it } from 'vitest';
import { calorieBalance, dayBalance, energyGoal, energySummary } from './health';

describe('energyGoal', () => {
  it('Mifflin-St Jeor x activity, 500 kcal deficit, 1.6 g/kg protein', () => {
    // BMR = 10*62 + 6.25*165 - 5*27 - 161 = 1355.25; x 1.55 = 2100.6
    const g = energyGoal({ age: 27, sex: 'female', heightCm: 165, activity: 'light', goal: 'lose', pace: 'normal' }, 62)!;
    expect(g.bmr).toBe(1360);
    expect(g.burn).toBe(2100);
    expect(g.target).toBe(1600);
    expect(g.protein).toBe(99);
    expect(g.kgPerWeek).toBe(-0.45);
    expect(g.notes).toEqual([]);
  });

  it('build muscle: +20% above the daily burn', () => {
    // BMR = 800 + 1125 - 150 + 5 = 1780; x 1.4 = 2492; x 1.2 = 2990
    const g = energyGoal({ age: 30, sex: 'male', heightCm: 180, activity: 'sedentary', goal: 'gain', pace: 'fast' }, 80)!;
    expect(g.burn).toBe(2490);
    expect(g.target).toBe(2990);
    expect(g.protein).toBe(128);
  });

  it('keep weight and recomposition eat what they burn; keep weight uses 0.8 g/kg protein', () => {
    const keep = energyGoal({ age: 30, sex: 'male', heightCm: 180, activity: 'active', goal: 'keep' }, 80)!;
    const recomp = energyGoal({ age: 30, sex: 'male', heightCm: 180, activity: 'active', goal: 'recomp' }, 80)!;
    expect(keep.target).toBe(keep.burn);
    expect(recomp.target).toBe(recomp.burn);
    expect(keep.protein).toBe(64);
    expect(recomp.protein).toBe(128);
  });

  it('never more than ~1% of body weight a week, never under 1200 kcal (women)', () => {
    // burn ~1481; a 750 deficit is capped to 550 (1% of 50 kg); 931 < 1200 -> 1200
    const g = energyGoal({ age: 50, sex: 'female', heightCm: 155, activity: 'sedentary', goal: 'lose', pace: 'fast' }, 50)!;
    expect(g.target).toBe(1200);
    expect(g.notes).toEqual(['capped', 'floor']);
  });

  it('no fat-loss goal under BMI 18.5 or under 18; needs age, sex, height and weight', () => {
    expect(energyGoal({ age: 25, sex: 'female', heightCm: 165, activity: 'light', goal: 'lose' }, 48)!.goal).toBe('keep');
    expect(energyGoal({ age: 25, sex: 'female', heightCm: 165, activity: 'light', goal: 'lose' }, 48)!.notes).toContain('underweight');
    const teen = energyGoal({ age: 16, sex: 'male', heightCm: 175, activity: 'active', goal: 'gain' }, 60)!;
    expect(teen.goal).toBe('keep');
    expect(teen.notes).toContain('teen');
    expect(energyGoal({ age: 25, sex: 'female', activity: 'light' }, 60)).toBeNull();
    expect(energyGoal({ age: 25, sex: 'female', heightCm: 165 }, null)).toBeNull();
  });

  it('summary: average of finished, fully logged days vs burn and goal', () => {
    const s = energySummary(
      [
        { date: '2026-11-20', value: 1500 },
        { date: '2026-11-21', value: 1700 },
        { date: '2026-11-22', value: 600 }, // only a snack logged: left out
        { date: '2026-11-25', value: 300 }, // today, not over yet: left out
      ],
      { burn: 2100, target: 1600 },
      '2026-11-25',
    )!;
    expect(s).toEqual({ days: 2, skipped: 1, avg: 1600, vsBurn: -500, vsTarget: 0, kgPerWeek: -0.45 });
  });

  it('balance: eaten minus burn per day, average and kg a week', () => {
    const b = calorieBalance(
      [
        { date: '2026-11-20', value: 1600 },
        { date: '2026-11-21', value: 2600 },
        { date: '2026-11-22', value: 500 },
        { date: '2026-11-25', value: 900 },
      ],
      { burn: 2100, target: 1600 },
      '2026-11-25',
    );
    expect(b.days).toEqual([
      { date: '2026-11-20', value: -500 },
      { date: '2026-11-21', value: 500 },
    ]);
    expect(b.skipped).toBe(1);
    expect(b.avg).toBe(0);
    expect(b.kgPerWeek).toBe(0);
    expect(b.goal).toBe(-500);
    expect(dayBalance(1600, 2100)).toEqual({ state: 'deficit', value: -500 });
    expect(dayBalance(2400, 2100)).toEqual({ state: 'surplus', value: 300 });
    expect(dayBalance(2150, 2100).state).toBe('even');
    expect(dayBalance(400, 2100).state).toBe('partial');
    expect(dayBalance(null, 2100).state).toBe('none');
  });
});

describe('day goals and totals (Food)', async () => {
  const { foodTotals, macroGoals } = await import('./health');
  it('fat 30% of energy, carbs the rest, fiber 14 g / 1000 kcal (min 25), sugars 90 g per 2000 kcal', () => {
    expect(macroGoals({ target: 1600, protein: 99 })).toEqual({ kcal: 1600, protein: 99, fat: 53, carbs: 182, fiber: 25, sugars: 72 });
    expect(macroGoals({ target: 2500, protein: 120 }).fiber).toBe(35);
  });
  it('totals: estimates give a ± range, red-label foods are counted', () => {
    const t = foodTotals([
      { kcal: 200, protein: 10, fat: 5, carbs: 20, fiber: 3, sugars: 2, exact: true, red: [] },
      { kcal: 400, protein: 4, fat: 20, carbs: 50, fiber: 1, sugars: 30, exact: false, red: ['sugar', 'satFat'] },
    ]);
    expect(t).toMatchObject({ kcal: 600, protein: 14, fiber: 4, sugars: 32, plusMinus: 100, redFoods: 1 });
  });
});
