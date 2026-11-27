// Kitchen logic (owner, Nov 2026): recipe nutrition from the MoH database,
// kosher type of a dish. Pure, tested (kitchen.test.ts).
import type { Ingredient, Kosher } from '../data/ingredients';
import type { Recipe } from '../data/recipes';
import type { FoodsIL } from './food';

export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  sugars: number;
  fiber: number;
  satFat: number;
  /** mg */
  sodium: number;
  grams: number;
}

const ZERO = (): Nutrients => ({ kcal: 0, protein: 0, fat: 0, carbs: 0, sugars: 0, fiber: 0, satFat: 0, sodium: 0, grams: 0 });

/** MoH row by code (built once per database). */
const index = new WeakMap<FoodsIL, Map<number, FoodsIL['foods'][number]>>();
function rowOf(db: FoodsIL, code: number) {
  let m = index.get(db);
  if (!m) index.set(db, (m = new Map(db.foods.map((r) => [r[0], r]))));
  return m.get(code);
}

/** Per 100 g of an ingredient (MoH row, or its own USDA values). */
export function per100Of(db: FoodsIL, i: Ingredient): Omit<Nutrients, 'grams'> | null {
  if (i.per100) return { sugars: 0, fiber: 0, satFat: 0, sodium: 0, ...i.per100 };
  const r = rowOf(db, i.moh);
  if (!r) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { kcal: n(r[3]), protein: n(r[4]), fat: n(r[5]), carbs: n(r[6]), sugars: n(r[8]), fiber: n(r[9]), satFat: n(r[10]), sodium: n(r[11]) };
}

const round = (n: Nutrients): Nutrients => ({
  kcal: Math.round(n.kcal),
  protein: Math.round(n.protein * 10) / 10,
  fat: Math.round(n.fat * 10) / 10,
  carbs: Math.round(n.carbs * 10) / 10,
  sugars: Math.round(n.sugars * 10) / 10,
  fiber: Math.round(n.fiber * 10) / 10,
  satFat: Math.round(n.satFat * 10) / 10,
  sodium: Math.round(n.sodium),
  grams: Math.round(n.grams),
});

/**
 * Nutrition of a list of [ingredient, grams]: sum of each raw ingredient's
 * values for its weight (the standard "recipe from ingredients" method; the
 * dish weighs less after cooking, the nutrients stay).
 */
export function sumNutrients(db: FoodsIL, items: [string, number][], ing: Map<string, Ingredient>): Nutrients {
  const t = ZERO();
  for (const [id, g] of items) {
    const i = ing.get(id);
    const p = i && per100Of(db, i);
    if (!p || !(g > 0)) continue;
    const f = g / 100;
    t.kcal += p.kcal * f;
    t.protein += p.protein * f;
    t.fat += p.fat * f;
    t.carbs += p.carbs * f;
    t.sugars += p.sugars * f;
    t.fiber += p.fiber * f;
    t.satFat += p.satFat * f;
    t.sodium += p.sodium * f;
    t.grams += g;
  }
  return t;
}

/** Whole dish and one serving (x `scale` for batch cooking). */
export function recipeNutrition(db: FoodsIL, r: Recipe, ing: Map<string, Ingredient>) {
  const total = sumNutrients(db, r.ing, ing);
  const one = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v / r.servings])) as unknown as Nutrients;
  return { total: round(total), serving: round(one) };
}

/** Meat (בשרי), dairy (חלבי) or parve, from the ingredients. */
export function kosherOf(r: Pick<Recipe, 'ing'>, ing: Map<string, Ingredient>): Kosher {
  let meat = false;
  let dairy = false;
  for (const [id, g] of r.ing) {
    const k = g > 0 ? ing.get(id)?.kosher : undefined;
    if (k === 'meat') meat = true;
    if (k === 'dairy') dairy = true;
  }
  return meat ? 'meat' : dairy ? 'dairy' : 'parve';
}

/** Ingredients that can't be in one dish together: meat + dairy, and fish with meat. */
export function kosherProblem(r: Pick<Recipe, 'ing'>, ing: Map<string, Ingredient>): string | null {
  const list = r.ing.filter(([, g]) => g > 0).map(([id]) => ing.get(id));
  const has = (f: (i: Ingredient) => boolean) => list.some((i) => i && f(i));
  if (has((i) => i.kosher === 'meat') && has((i) => i.kosher === 'dairy')) return 'meat+dairy';
  if (has((i) => i.group === 'fish') && has((i) => i.kosher === 'meat')) return 'fish+meat';
  return null;
}
