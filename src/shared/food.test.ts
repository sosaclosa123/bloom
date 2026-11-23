import { describe, expect, it } from 'vitest';
import db from '../data/foods-il.json';
import { forGrams, packWeight, parseOff, parseServing, pieceWeight, piecesToGrams, searchIL, typicalPiece, validBarcode, type FoodsIL } from './food';

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

describe('real products first, drinks, automatic tags', async () => {
  const { autoTags } = await import('./food');
  it('everyday names find the real product (coke -> Coca-Cola, not diet)', () => {
    expect(searchIL(DB, 'coke', 'en', 3, { drinks: true })[0].name).toMatch(/Coca Cola/);
    expect(searchIL(DB, 'coke zero', 'en', 3, { drinks: true })[0].name).toMatch(/sugar-free/);
    expect(searchIL(DB, 'קוקה קולה', 'he', 3, { drinks: true })[0].name).toContain('קוקה קולה');
    expect(searchIL(DB, 'latte', 'en', 3, { drinks: true })[0].name).toMatch(/Cappuccino/);
    expect(searchIL(DB, 'snickers', 'en')[0].name).toMatch(/SNICKERS/);
  });
  it('drinks leave plain water out', () => {
    expect(searchIL(DB, 'מים', 'he', 12, { drinks: true }).some((p) => p.name.startsWith('מים, מי ברז') || p.name.startsWith('מים מוגזים, לא'))).toBe(false);
  });
  it('tags from names and nutrients (UK FSA / EU thresholds)', () => {
    const sn = searchIL(DB, 'snickers', 'en')[0];
    expect(autoTags(sn)).toEqual(expect.arrayContaining(['fatty', 'sugar']));
    expect(autoTags(searchIL(DB, 'שניצל חזה עוף', 'he')[0])).toEqual(expect.arrayContaining(['fried', 'gluten']));
    expect(autoTags(searchIL(DB, 'coke', 'en', 1, { drinks: true })[0], true)).toEqual(expect.arrayContaining(['caffeine', 'sugar']));
    expect(autoTags({ name: 'Cappuccino, decaffeinated', nameAlt: '', fat: 1, sugars: 3, fiber: 0 }, true)).not.toContain('caffeine');
  });
});

describe('pieces ("I ate 5 cookies")', () => {
  it('reads pieces from a label serving', () => {
    expect(parseServing('3 biscuits (30 g)')).toEqual({ count: 3, grams: 30 });
    expect(parseServing('1 cookie (12.5g)')).toEqual({ count: 1, grams: 12.5 });
    expect(parseServing('2 עוגיות (25 גרם)')).toEqual({ count: 2, grams: 25 });
    expect(parseServing('1 portion (30 g)')).toBeNull();
    expect(parseServing('2 tbsp (30 g)')).toBeNull();
    expect(parseServing('30 g')).toBeNull();
  });
  it('OFF product: piece from the serving, box from the quantity', () => {
    const p = parseOff({ code: '1', product_name: 'Butter cookies', nutriments: { 'energy-kcal_100g': 500 }, serving_size: '4 cookies (32 g)', product_quantity: 350, product_quantity_unit: 'g' }, 'en')!;
    expect(p.pieceG).toBe(8);
    expect(p.packG).toBe(350);
  });
  it('MoH database: Oreo has a piece weight', () => {
    const oreo = searchIL(DB, 'oreo', 'en').find((p) => /oreo/i.test(p.name))!;
    expect(oreo.pieceG).toBe(11);
  });
  it('picks yours first, then the label, then a typical weight', () => {
    const p = { name: 'Butter cookies', nameAlt: '', pieceG: 8, packG: 350 };
    expect(pieceWeight(p, { packG: 350, pieces: 28 })).toEqual({ grams: 12.5, source: 'yours' });
    expect(pieceWeight(p)).toEqual({ grams: 8, source: 'label' });
    expect(pieceWeight({ ...p, pieceG: null })).toEqual({ grams: 12, source: 'typical' });
    expect(pieceWeight({ name: 'Yellow cheese', nameAlt: '', pieceG: null })).toBeNull();
    expect(typicalPiece('קרקר מלוח')).toBe(5);
    expect(typicalPiece('Donut')).toBeNull();
    expect(packWeight(p, { packG: 300 })).toBe(300);
    expect(packWeight(p)).toBe(350);
    expect(piecesToGrams(5, 12.5)).toBe(62.5);
    expect(forGrams({ kcal: 480, protein: 6, fat: 20, carbs: 68 }, piecesToGrams(5, 12.5)).kcal).toBe(300);
  });
});
