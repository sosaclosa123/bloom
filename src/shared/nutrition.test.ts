// Healthy score (Nutri-Score 2023), Israeli red labels and ml (sources in nutrition.ts).
import { describe, expect, it } from 'vitest';
import { densityOf, ilFacts, markOf, mlToGrams, nutriScore, redLabels } from './nutrition';
import foods from '../data/foods-il.json';

type Row = [number, string, string, number, number, number, number, [number, number][], number, number, number, number];
const rows = (foods as unknown as { foods: Row[] }).foods;
const find = (re: RegExp) => rows.find((r) => re.test(r[2]))!;
const grade = (r: Row) => {
  const p = { kcal: r[3], protein: r[4], fat: r[5], carbs: r[6], sugars: r[8], fiber: r[9], satFat: r[10], sodium: r[11] };
  return nutriScore(p, ilFacts(r[0], r[2], r[1], p))?.grade;
};

describe('healthy score (Nutri-Score 2023)', () => {
  it('known foods get the grades the official rule gives', () => {
    expect(grade(find(/^Soft drink, cola, inc\. Coca Cola/i))).toBe('e');
    expect(grade(find(/^Chicken, breast, NS as to cooking method, skin not eaten/i))).toBe('a');
    expect(grade(find(/^Apple, with peel, raw/i))).toBe('a');
    expect(grade(find(/^Oil, olive$/i))).toBe('b');
    expect(['a', 'b']).toContain(grade(find(/^Milk, cow, 1% fat/i)));
    expect(grade(find(/^Water, tap/i))).toBe('a');
  });

  it('by hand: cola-like drink = E, red meat protein capped at 2 points', () => {
    expect(nutriScore({ kcal: 42, protein: 0, sugars: 10.6, sodium: 4 }, { kind: 'drink', fvl: 0 })).toEqual({ score: 12, grade: 'e' });
    const steak = { kcal: 200, protein: 26, fat: 10, satFat: 4, sodium: 60, sugars: 0 };
    expect(nutriScore(steak, { kind: 'food', fvl: 0, redMeat: true })!.score).toBe(nutriScore(steak, { kind: 'food', fvl: 0 })!.score + 5);
  });

  it('marks: A/B healthy, C none, D/E less healthy', () => {
    expect([markOf('a'), markOf('b'), markOf('c'), markOf('d'), markOf('e')]).toEqual(['healthy', 'healthy', null, 'less', 'less']);
  });
});

describe('Israeli red labels', () => {
  it('solid per 100 g: sodium > 400 mg, sugars > 10 g, sat fat > 4 g', () => {
    expect(redLabels({ kcal: 500, protein: 5, sugars: 50, sodium: 450, satFat: 15 }, { kind: 'food' })).toEqual(['sugar', 'sodium', 'satFat']);
    expect(redLabels({ kcal: 100, protein: 5, sugars: 10, sodium: 400, satFat: 4 }, { kind: 'food' })).toEqual([]);
  });
  it('liquid per 100 ml: sugars > 5 g; plain foods are exempt', () => {
    expect(redLabels({ kcal: 42, protein: 0, sugars: 10.6 }, { kind: 'drink', liquid: true })).toEqual(['sugar']);
    expect(redLabels({ kcal: 52, protein: 0, sugars: 10.4 }, { kind: 'food', single: true })).toEqual([]);
  });
});

describe('ml', () => {
  it('density from the 240 ml cup in the database', () => {
    const oil = find(/^Oil, olive$/i);
    expect(densityOf(oil[7])).toBeCloseTo(0.9, 2);
    expect(mlToGrams(100, densityOf(oil[7]))).toBe(90);
    expect(mlToGrams(200, null)).toBe(200); // unknown: 1 g/ml
  });
  it('Modulen, milk, cola and soy drink are liquids; cheese and bread are not', () => {
    for (const re of [/MODULEN/, /^Milk, cow, 3% fat$/, /^Soy drink, lite/]) expect(ilFacts(find(re)[0], find(re)[2]).liquid).toBe(true);
    for (const re of [/^Cheese, cow milk, cheddar/, /^Bread, white/i]) expect(ilFacts(find(re)[0], find(re)[2]).liquid).toBe(false);
  });
});

describe('amount units (owner: ml for drinks and liquid foods like Modulen)', async () => {
  const { amountUnits, ilProduct, nutrientsFor, unitGrams } = await import('./food');
  const db = foods as never;
  const prod = (re: RegExp) => ilProduct(db, find(re) as never, 'en');

  it('Modulen: ml first, exact only when its density is known', () => {
    const m = prod(/MODULEN/);
    const u = amountUnits(m);
    expect(u[0].key).toBe('ml');
    expect(u.map((x) => x.key)).toContain('g');
    expect(unitGrams(250, u[0])).toBe(250); // no cup in the data: 1 g/ml
    expect(u[0].exact).toBe(true); // water-based liquid: ~1 g/ml
    expect(nutrientsFor(m, 250).kcal).toBe(250);
  });

  it('olive oil in ml uses its real density; a tablespoon from the data is an estimate', () => {
    const o = prod(/^Oil, olive$/);
    const ml = amountUnits(o).find((x) => x.key === 'ml')!;
    expect(ml.exact).toBe(true);
    expect(unitGrams(10, ml)).toBe(9);
    const portion = amountUnits(o).find((x) => x.kind === 'portion');
    if (portion) expect(portion.exact).toBe(false);
  });

  it('milk: ml first; cheese: grams first, no ml', () => {
    expect(amountUnits(prod(/^Milk, cow, 3% fat$/))[0].key).toBe('ml');
    const ch = amountUnits(prod(/^Cheese, cow milk, cheddar/));
    expect(ch[0].key).toBe('g');
    expect(ch.some((x) => x.key === 'ml')).toBe(false);
  });

  it('pieces: from your own box = exact, a typical weight = estimate', () => {
    const cookie = { name: 'Chocolate chip cookies', nameAlt: '', pieceG: null, packG: null, portions: [], liquid: false, density: null, source: 'il' as const };
    expect(amountUnits(cookie).find((x) => x.key === 'piece')).toMatchObject({ gramsEach: 12, exact: false });
    expect(amountUnits(cookie, { packG: 300, pieces: 20 }).find((x) => x.key === 'piece')).toMatchObject({ gramsEach: 15, exact: true });
    expect(amountUnits(cookie, { packG: 300, pieces: 20 }).find((x) => x.key === 'box')).toMatchObject({ gramsEach: 300, exact: true });
  });
});

describe('start amount', async () => {
  const { ilProduct, startGrams } = await import('./food');
  it('olive oil starts at a spoon, not a cup; unknown foods at 100 g', () => {
    const oil = ilProduct(foods as never, find(/^Oil, olive$/) as never, 'en');
    expect(startGrams(oil)).toBeLessThan(20);
    expect(startGrams({ portions: [] })).toBe(100);
  });
});
