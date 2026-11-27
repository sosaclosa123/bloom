import { describe, expect, it } from 'vitest';
import db from '../data/foods-il.json';
import { INGREDIENT, INGREDIENTS } from '../data/ingredients';
import { RECIPES } from '../data/recipes';
import type { FoodsIL } from './food';
import { kosherOf, kosherProblem, per100Of, recipeNutrition } from './kitchen';

const DB = db as unknown as FoodsIL;
const HE = /[֐-׿]/;

describe('Kitchen ingredients', () => {
  it('every ingredient is in the MoH database (or has its own sourced values)', () => {
    for (const i of INGREDIENTS) {
      const p = per100Of(DB, i);
      expect(p, i.id).not.toBeNull();
      expect(HE.test(i.he), i.id).toBe(true);
    }
    expect(new Set(INGREDIENTS.map((i) => i.id)).size).toBe(INGREDIENTS.length);
  });
  it('kosher types are right for the basics', () => {
    const k = (id: string) => INGREDIENT.get(id)!.kosher;
    expect([k('chicken-breast'), k('beef-ground'), k('chicken-broth')]).toEqual(['meat', 'meat', 'meat']);
    expect([k('butter'), k('cottage'), k('milk')]).toEqual(['dairy', 'dairy', 'dairy']);
    expect([k('margarine'), k('salmon'), k('egg'), k('soy-drink'), k('coconut-milk')]).toEqual(['parve', 'parve', 'parve', 'parve', 'parve']);
  });
  it('swaps point to real ingredients and never break kosher (no dairy for meat)', () => {
    for (const i of INGREDIENTS)
      for (const s of i.swaps ?? []) {
        const o = INGREDIENT.get(s);
        expect(o, `${i.id} -> ${s}`).toBeDefined();
        if (i.kosher !== 'dairy') expect(o!.kosher === 'dairy' && i.kosher === 'parve' ? 'ok' : o!.kosher === 'dairy' ? 'bad' : 'ok', `${i.id} -> ${s}`).toBe('ok');
      }
  });
});

describe('Kitchen recipes', () => {
  it('has at least 60 recipes with unique ids', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
  it('uses only known ingredients, real amounts, and both languages', () => {
    for (const r of RECIPES) {
      expect(HE.test(r.he), r.id).toBe(true);
      expect(r.en.length, r.id).toBeGreaterThan(2);
      expect(r.steps.length, r.id).toBeGreaterThan(0);
      for (const s of r.steps) {
        expect(HE.test(s.he), r.id).toBe(true);
        expect(s.en.length, r.id).toBeGreaterThan(5);
      }
      for (const [id, g] of r.ing) {
        expect(INGREDIENT.has(id), `${r.id}: ${id}`).toBe(true);
        expect(g, `${r.id}: ${id}`).toBeGreaterThan(0);
      }
      // Step timers fit in the total time (some steps run side by side).
      const timers = r.steps.reduce((a, s) => a + (s.min ?? 0), 0);
      expect(timers, r.id).toBeLessThanOrEqual(r.time + 20);
    }
  });
  it('is kosher: never meat with dairy, never fish with meat or dairy', () => {
    for (const r of RECIPES) {
      expect(kosherProblem(r, INGREDIENT), r.id).toBeNull();
      const fish = r.ing.some(([id]) => INGREDIENT.get(id)!.group === 'fish');
      if (fish) expect(kosherOf(r, INGREDIENT), r.id).toBe('parve');
    }
    expect(kosherProblem({ ing: [['beef-ground', 100], ['butter', 10]] }, INGREDIENT)).toBe('meat+dairy');
    expect(kosherOf({ ing: [['chicken-breast', 100], ['margarine', 10]] }, INGREDIENT)).toBe('meat');
  });
  it('every kosher type and meal is covered', () => {
    const kinds = new Set(RECIPES.map((r) => kosherOf(r, INGREDIENT)));
    expect([...kinds].sort()).toEqual(['dairy', 'meat', 'parve']);
    for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as const) expect(RECIPES.filter((r) => r.meal.includes(m)).length, m).toBeGreaterThanOrEqual(8);
  });
  it('nutrition per serving is sane (meals 250-950 kcal, soups/salads/breakfast from 150, snacks 80-450)', () => {
    for (const r of RECIPES) {
      const { serving } = recipeNutrition(DB, r, INGREDIENT);
      const snackOnly = r.meal.every((m) => m === 'snack');
      const light = r.meal.includes('snack') || r.meal.includes('breakfast') || r.tags?.some((t) => t === 'soup' || t === 'salad');
      const [lo, hi] = snackOnly ? [80, 450] : [light ? 150 : 250, 950];
      expect(serving.kcal, r.id).toBeGreaterThanOrEqual(lo);
      expect(serving.kcal, r.id).toBeLessThanOrEqual(hi);
      // Energy from macros roughly matches the calories (Atwater 4/4/9; fiber and rounding allowed).
      // Fiber (2 kcal/g) is counted inside carbs by some foods and next to them by others (MoH).
      const atwater = serving.protein * 4 + serving.carbs * 4 + serving.fat * 9;
      const off = Math.min(...[-2, 0, 2].map((f) => Math.abs(atwater + serving.fiber * f - serving.kcal))) / serving.kcal;
      expect(off, r.id).toBeLessThan(0.15);
    }
  });
  it('known dish: oven schnitzel is high protein, shakshuka is light', () => {
    const s = recipeNutrition(DB, RECIPES.find((r) => r.id === 'oven-schnitzel')!, INGREDIENT).serving;
    expect(s.protein).toBeGreaterThan(35);
    const k = recipeNutrition(DB, RECIPES.find((r) => r.id === 'shakshuka')!, INGREDIENT).serving;
    expect(k.kcal).toBeLessThan(450);
  });
});

import { applySwaps, foodKosher, kosherClock, scaleRecipe, slotFor, suggest, type DayIntake, type Taste } from './kitchen';

const taste = (t: Partial<Taste> = {}): Taste => ({ cuisines: [], spice: 1, never: [], allergies: [], rated: {}, ...t });
const day = (foods: { text: string; time: string; kcal?: number; tags?: string[]; productId?: string }[] = [], kcal = 0, protein = 0, fiber = 0): DayIntake => ({
  kcal,
  protein,
  fiber,
  foods: foods.map((f) => ({ date: '2026-11-27', tags: [], ...f })),
});
const at = (hhmm: string) => new Date(`2026-11-27T${hhmm}:00`);
const base = { recipes: RECIPES, ing: INGREDIENT, db: DB, goals: { kcal: 2000, protein: 110, fiber: 28 }, weightKg: 70 };

describe('Kitchen suggestions (rules, no AI)', () => {
  it('meal by the clock', () => {
    expect(slotFor(at('08:00'))).toBe('breakfast');
    expect(slotFor(at('13:00'))).toBe('lunch');
    expect(slotFor(at('19:30'))).toBe('dinner');
    expect(slotFor(at('23:00'))).toBe('snack');
    expect(slotFor(at('19:30'), 200)).toBe('snack');
  });
  it('knows meat / dairy / parve of logged food', () => {
    expect(foodKosher({ text: 'חזה עוף', productId: 'il:24123130', tags: [] })).toBe('meat');
    expect(foodKosher({ text: 'שניצל', tags: [] })).toBe('meat');
    expect(foodKosher({ text: 'גבינה לבנה 5%', tags: ['dairy'] })).toBe('dairy');
    expect(foodKosher({ text: 'משקה סויה', tags: ['dairy'] })).toBe('parve');
    expect(foodKosher({ text: 'חמאת בוטנים', tags: [] })).toBe('parve');
    expect(foodKosher({ text: 'Banana', tags: [] })).toBe('parve');
  });
  it('kosher clock: 6 h after meat, 30 min after dairy', () => {
    const meat = day([{ text: 'Chicken breast', time: '13:00' }]).foods;
    expect(kosherClock(meat, at('15:00')).noDairyUntil).toBe(at('19:00').getTime());
    expect(kosherClock(meat, at('19:01')).noDairyUntil).toBeNull();
    const dairy = day([{ text: 'Yogurt', time: '10:00', tags: ['dairy'] }]).foods;
    expect(kosherClock(dairy, at('10:15')).noMeatUntil).toBe(at('10:30').getTime());
    expect(kosherClock(dairy, at('10:31')).noMeatUntil).toBeNull();
    // No dairy dish is suggested 2 h after chicken.
    const s = suggest({ ...base, now: at('15:00'), today: day([{ text: 'Chicken breast', time: '13:00' }], 600, 40), taste: taste(), slot: 'snack' });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.kosher !== 'dairy')).toBe(true);
    const m = suggest({ ...base, now: at('10:15'), today: day([{ text: 'Yogurt', time: '10:00', tags: ['dairy'] }], 200, 10), taste: taste(), slot: 'lunch' });
    expect(m.every((x) => x.kosher !== 'meat')).toBe(true);
  });
  it("owner's example: craving schnitzel after fries -> the baked one, not fried", () => {
    const s = suggest({ ...base, now: at('19:00'), today: day([{ text: "צ'יפס", time: '13:00', tags: ['fried'] }], 900, 30), taste: taste({ cuisines: ['middle-eastern'], spice: 2 }), crave: 'schnitzel' });
    expect(s[0].recipe.id).toBe('oven-schnitzel');
    expect(s[0].why).toContain('crave');
    const fried = s.find((x) => x.recipe.id === 'classic-schnitzel');
    expect(fried ? fried.score : -99).toBeLessThan(s[0].score - 5);
  });
  it('protein behind at dinner -> a high-protein dinner, never over the calories left', () => {
    const s = suggest({ ...base, now: at('19:00'), today: day([], 1100, 30), taste: taste() });
    expect(s[0].serving.protein).toBeGreaterThanOrEqual(30);
    expect(s[0].why).toContain('protein');
    expect(s[0].serving.kcal).toBeLessThanOrEqual(900 + 150);
  });
  it('varies: chicken already today -> the top dinner is not chicken', () => {
    const s = suggest({ ...base, now: at('19:00'), today: day([{ text: 'חזה עוף', time: '13:00', productId: 'il:24123130' }], 900, 50), taste: taste() });
    expect(s[0].recipe.ing.some(([id]) => INGREDIENT.get(id)!.group === 'poultry')).toBe(false);
  });
  it('a recipe eaten in the last days goes down the list', () => {
    const now = at('19:00');
    const first = suggest({ ...base, now, today: day([], 900, 50), taste: taste() })[0].recipe.id;
    const again = suggest({ ...base, now, today: day([], 900, 50), taste: taste(), recentRecipes: [first] });
    expect(again[0].recipe.id).not.toBe(first);
  });
  it('"never" swaps for a real ingredient, keeps kosher, or drops the dish', () => {
    const fal = RECIPES.find((r) => r.id === 'baked-falafel')!;
    const sw = applySwaps(fal, new Set(['chickpeas-dry']), INGREDIENT)!;
    expect(sw.recipe.ing.some(([id]) => id === 'white-beans-dry')).toBe(true);
    expect(sw.swapped).toEqual([['chickpeas-dry', 'white-beans-dry']]);
    const sch = RECIPES.find((r) => r.id === 'oven-schnitzel')!;
    expect(applySwaps(sch, new Set(['chicken-breast']), INGREDIENT)!.recipe.ing[0][0]).toBe('turkey-breast');
    // A spice with no swap is left out; a main part with no swap = no dish.
    expect(applySwaps(sch, new Set(['paprika']), INGREDIENT)!.swapped).toEqual([['paprika', null]]);
    expect(applySwaps(RECIPES.find((r) => r.id === 'majadra')!, new Set(['lentils']), INGREDIENT)).toBeNull();
    // Never chicken: nothing suggested has chicken in it.
    const s = suggest({ ...base, now: at('19:00'), today: day(), taste: taste({ never: ['chicken-breast', 'chicken-thigh', 'chicken-ground', 'chicken-broth'] }) });
    expect(s.every((x) => !x.recipe.ing.some(([id]) => id.startsWith('chicken')))).toBe(true);
  });
  it('allergies remove the dish when there is no swap', () => {
    const s = suggest({ ...base, now: at('19:00'), today: day(), taste: taste({ allergies: ['fish', 'sesame'] }) });
    expect(s.some((x) => x.recipe.ing.some(([id]) => ['salmon', 'cod', 'tilapia', 'tuna-can', 'sea-bream', 'tahini', 'sesame', 'hummus'].includes(id)))).toBe(false);
  });
  it('taste filters: time, level, thumbs down', () => {
    const s = suggest({ ...base, now: at('19:00'), today: day(), taste: taste({ maxTime: 25, level: 1, rated: { 'lemon-herb-chicken': -1 } }) });
    expect(s.every((x) => x.recipe.time <= 25 && x.recipe.level === 1)).toBe(true);
    expect(s.some((x) => x.recipe.id === 'lemon-herb-chicken')).toBe(false);
  });
  it('my fridge: dishes from what is at home first', () => {
    const s = suggest({ ...base, now: at('19:00'), today: day(), taste: taste(), fridge: ['chicken-breast', 'broccoli', 'red-pepper', 'carrot', 'rice', 'soy-sauce', 'ginger', 'spring-onion'] });
    expect(s[0].missing!.length).toBeLessThanOrEqual(1);
    expect(s.slice(0, 3).map((x) => x.recipe.id)).toContain('chicken-stir-fry');
  });
  it('batch cooking scales every amount', () => {
    const r = scaleRecipe(RECIPES.find((x) => x.id === 'shakshuka')!, 6);
    expect(r.servings).toBe(6);
    expect(r.ing.find(([id]) => id === 'egg')![1]).toBe(660);
  });
});
