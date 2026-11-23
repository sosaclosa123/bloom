import { describe, expect, it } from 'vitest';
import db from '../data/foods-il.json';
import { forGrams, parseOff, searchIL, validBarcode, type FoodsIL } from './food';

const DB = db as unknown as FoodsIL;

describe('Israeli MoH food database (offline)', () => {
  it('has thousands of foods with calories', () => {
    expect(DB.foods.length).toBeGreaterThan(4000);
  });
  it('finds foods in Hebrew and English, simple names first', () => {
    const he = searchIL(DB, 'אורז לבן', 'he');
    expect(he[0].name).toContain('מבושל'); // cooked, not raw rice
    expect(he[0].name).not.toContain('לא מבושל');
    expect(searchIL(DB, 'rice white', 'en')[0].name).toMatch(/cooked/i);
    expect(searchIL(DB, 'rice white', 'en')[0].name).not.toMatch(/uncooked/i);
    const en = searchIL(DB, 'chicken breast', 'en');
    expect(en[0].name.toLowerCase()).toContain('chicken');
    expect(en[0].kcal).toBeGreaterThan(50);
    expect(searchIL(DB, 'a', 'en')).toEqual([]);
  });
  it('includes typical portions', () => {
    const r = searchIL(DB, 'banana', 'en', 30).find((p) => p.portions.length);
    expect(r?.portions[0].grams).toBeGreaterThan(0);
  });
});

describe('Open Food Facts products', () => {
  it('parses a product (Bamba, Osem)', () => {
    const p = parseOff({ code: '7290000066318', product_name: 'Bamba', product_name_he: 'במבה', brands: 'אסם,Osem', nutriments: { 'energy-kcal_100g': 535, proteins_100g: 15.6, fat_100g: 33, carbohydrates_100g: 49 }, serving_quantity: 25, serving_size: '25 g' }, 'he');
    expect(p).toMatchObject({ name: 'במבה', brand: 'אסם', kcal: 535, portions: [{ label: '25 g', grams: 25 }] });
    expect(parseOff({ code: '1', nutriments: { energy_100g: 2232 } }, 'en')?.kcal).toBe(533);
    expect(parseOff({ code: '1', nutriments: {} }, 'en')).toBeNull();
  });
  it('computes a portion and checks barcodes', () => {
    expect(forGrams({ kcal: 535, protein: 15.6, fat: 33, carbs: 49 }, 25)).toEqual({ kcal: 134, protein: 3.9, fat: 8.3, carbs: 12.3 });
    expect(validBarcode('7290000066318')).toBe(true);
    expect(validBarcode('7290000066317')).toBe(false);
    expect(validBarcode('abc')).toBe(false);
  });
});
