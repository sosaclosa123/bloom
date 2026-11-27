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
