// "My meals": a fixed meal's totals, changing an amount, eating N portions.
import { describe, expect, it } from 'vitest';
import { itemForGrams, labelOf, recipeFood, recipeTotals } from './food';
import type { RecipeItem } from './types';

const rice: RecipeItem = { text: 'Rice', grams: 100, kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, sugars: 0.1, per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, sugars: 0.1 }, source: 'il' };
const chicken: RecipeItem = { text: 'Chicken breast', grams: 150, kcal: 248, protein: 46.5, fat: 5.4, carbs: 0, sugars: null, per100: { kcal: 165, protein: 31, fat: 3.6, carbs: 0 }, source: 'il' };
const sauce: RecipeItem = { text: 'Home sauce', grams: 20, kcal: 40, protein: 1, fat: 3, carbs: 2, sugars: 1, per100: null, source: 'manual' };

describe('My meals', () => {
  it('adds up the whole meal', () => {
    expect(recipeTotals([rice, chicken, sauce])).toEqual({ kcal: 418, protein: 50.2, fat: 8.7, carbs: 30, sugars: 1.1, grams: 270 });
  });

  it('portions multiply everything', () => {
    expect(recipeTotals([rice, chicken], 0.5)).toEqual({ kcal: 189, protein: 24.6, fat: 2.9, carbs: 14, sugars: 0.1, grams: 125 });
  });

  it('changing an amount follows per-100 g values, or scales a typed-in food', () => {
    expect(itemForGrams(rice, 200)).toMatchObject({ grams: 200, kcal: 260, protein: 5.4, carbs: 56, sugars: 0.2 });
    expect(itemForGrams(sauce, 40)).toMatchObject({ grams: 40, kcal: 80, protein: 2, fat: 6, sugars: 2 });
  });

  it('eating a meal = one food line with its name and the foods inside', () => {
    const f = recipeFood({ id: 'r1', name: 'Rice bowl', label: 'healthy', items: [rice, chicken] }, 2);
    expect(f).toMatchObject({ text: 'Rice bowl', label: 'healthy', kcal: 756, protein: 98.4, grams: 500, source: 'recipe', recipe: { id: 'r1', portions: 2 } });
  });

  it('old foods get a pill from how they were logged', () => {
    expect(labelOf({ meal: 'drink' })).toBe('drink');
    expect(labelOf({ meal: 'lunch', snack: true })).toBe('snack');
    expect(labelOf({ meal: 'dinner' })).toBe('meal');
    expect(labelOf({ meal: 'dinner', label: 'treat' })).toBe('treat');
  });
});
