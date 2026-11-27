// Kitchen logic (owner, Nov 2026): recipe nutrition from the MoH database,
// kosher type of a dish. Pure, tested (kitchen.test.ts).
import type { Ingredient, Kosher } from '../data/ingredients';
import type { Recipe } from '../data/recipes';
import type { FoodsIL } from './food';
import type { Cuisine, Meal } from '../data/recipes';
import type { HealthFood } from './types';
import { nutriScore, markOf } from './nutrition';

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

// ================================================================ suggestions
//
// Rules + scores, no AI (owner, Nov 2026). Sources for the rules:
//  - Protein per meal ~0.4 g/kg, spread over the day's meals (Schoenfeld &
//    Aragon, J Int Soc Sports Nutr 2018). Day protein / calories = the Food
//    tab's goals (energyGoal / macroGoals in health.ts).
//  - Vegetables + fruit >= 400 g a day (WHO healthy diet fact sheet 2020;
//    Israeli MoH dietary guidelines 2019: half the plate vegetables).
//  - Limit fried foods; prefer baking, grilling, cooking (Israeli MoH dietary
//    guidelines 2019); sodium < 2,000 mg a day (WHO 2012), so a meal over
//    ~1,000 mg is marked down; free sugars < 10% of energy (WHO 2015).
//  - Variety: different protein sources over the day/week (MoH 2019, Harvard
//    Healthy Eating Plate).
//  - Kosher: never meat with dairy. Owner's waits: 6 h after meat before
//    dairy, 30 min after dairy before meat (real clock, from the Food log).

export type Slot = Meal;

/** Which meal the clock says (and a snack when little is left of the day's calories). */
export function slotFor(now: Date, kcalLeft: number | null = null): Slot {
  const h = now.getHours();
  if (h >= 22 || h < 5) return 'snack';
  if (kcalLeft != null && kcalLeft < 300) return 'snack';
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}

const MEAT_WORDS = /(^|[\s,(])(בשר|בשרי|עוף|עופות|הודו|פרגית|פרגיות|שניצל|קבב|קציצ|המבורגר|נקניק|נקניקיי|שווארמה|סטייק|אנטריקוט|כבד|טלה|כבש|בקר|פסטרמה|ציר עוף|מרק עוף|chicken|beef|turkey|meat|schnitzel|burger|hamburger|shawarma|kebab|steak|sausage|salami|pastrami|lamb|veal|liver|meatball)/i;
const DAIRY_WORDS = /(^|[\s,(])(חלב|חלבי|גבינ|יוגורט|שמנת|חמאה|קוטג|לבנה|מעדן|גלידה|שוקו|פטה|מוצרלה|פרמזן|לאטה|קפוצ׳ינו|קפוצינו|milk|cheese|yogh?urt|cream|butter|cottage|labane|labneh|ice cream|latte|cappuccino|feta|mozzarella|parmesan)/i;
const PARVE_WORDS = /פרווה|parve|pareve|סויה|soy|שקדים|almond|אורז|rice|oat|שיבולת|קוקוס|coconut|חמאת בוטנים|peanut butter|קקאו butter|חמאת קקאו|cocoa butter|חלב אם/i;

/** Meat / dairy / parve of a logged food: saved type, MoH food group, or its name. */
export function foodKosher(f: Pick<HealthFood, 'text' | 'product' | 'productId' | 'tags'> & { kosher?: Kosher | null }): Kosher {
  if (f.kosher) return f.kosher;
  const code = f.productId?.startsWith('il:') ? f.productId.slice(3) : '';
  const g2 = code.slice(0, 2);
  if (['21', '22', '23', '24', '25'].includes(g2)) return 'meat';
  if (['11', '12', '13', '14'].includes(g2) && !/soy|סויה|non-dairy|פרווה/i.test(`${f.text} ${f.product ?? ''}`)) return 'dairy';
  if (code.startsWith('811')) return 'dairy'; // butter
  const name = `${f.text} ${f.product ?? ''}`;
  if (MEAT_WORDS.test(name)) return 'meat';
  if ((f.tags ?? []).includes('dairy') || DAIRY_WORDS.test(name)) return PARVE_WORDS.test(name) ? 'parve' : 'dairy';
  return 'parve';
}

export const MEAT_WAIT_MIN = 6 * 60;
export const DAIRY_WAIT_MIN = 30;

const atOf = (date: string, time: string) => new Date(`${date}T${/^\d\d:\d\d/.test(time) ? time.slice(0, 5) : '12:00'}:00`).getTime();

/** What can't be eaten right now and until when (ms), from today's and yesterday's food log. */
export function kosherClock(foods: Pick<HealthFood, 'date' | 'time' | 'text' | 'product' | 'productId' | 'tags' | 'deletedAt'>[], now: Date) {
  let meat = 0;
  let dairy = 0;
  for (const f of foods) {
    if (f.deletedAt) continue;
    const at = atOf(f.date, f.time);
    if (at > now.getTime()) continue;
    const k = foodKosher(f as Parameters<typeof foodKosher>[0]);
    if (k === 'meat') meat = Math.max(meat, at);
    if (k === 'dairy') dairy = Math.max(dairy, at);
  }
  const t = now.getTime();
  const noDairyUntil = meat && meat + MEAT_WAIT_MIN * 60_000 > t ? meat + MEAT_WAIT_MIN * 60_000 : null;
  const noMeatUntil = dairy && dairy + DAIRY_WAIT_MIN * 60_000 > t ? dairy + DAIRY_WAIT_MIN * 60_000 : null;
  return { noDairyUntil, noMeatUntil };
}

// ---------------------------------------------------------------- taste + swaps

export interface Taste {
  cuisines: Cuisine[];
  /** 0 mild, 1 some, 2 hot */
  spice: 0 | 1 | 2;
  /** Ingredient ids never to suggest ("never tofu"). */
  never: string[];
  /** Allergy / avoid groups (ALLERGIES). */
  allergies: string[];
  rated: Record<string, 1 | -1>;
  maxTime?: number | null;
  level?: 1 | 2 | 3 | null;
}

export const ALLERGIES: Record<string, string[]> = {
  nuts: ['almonds', 'walnuts', 'pine-nuts', 'peanut-butter'],
  sesame: ['tahini', 'sesame', 'hummus', 'zaatar'],
  fish: ['salmon', 'tilapia', 'sea-bream', 'cod', 'tuna-can'],
  eggs: ['egg', 'egg-white', 'mayo-light'],
  dairy: ['cottage', 'white-cheese', 'labneh', 'yogurt', 'yogurt-0', 'milk', 'feta', 'yellow-cheese', 'mozzarella', 'parmesan', 'butter'],
  gluten: ['pasta', 'pasta-ww', 'flour', 'flour-ww', 'breadcrumbs', 'cornflakes', 'pita-ww', 'bread-ww', 'tortilla-ww', 'bun-ww', 'couscous-ww', 'bulgur', 'oats'],
  soy: ['soy-sauce', 'soy-drink', 'tofu'],
};

const LITTLE = new Set<string>(['spice', 'herb']);

/**
 * The recipe without the ingredients you never eat: each one is replaced by
 * its first working swap (not avoided, keeps the dish kosher); a spice or herb
 * with no swap is just left out. null = no way to make it.
 */
export function applySwaps(r: Recipe, avoid: Set<string>, ing: Map<string, Ingredient>): { recipe: Recipe; swapped: [string, string | null][] } | null {
  if (!r.ing.some(([id]) => avoid.has(id))) return { recipe: r, swapped: [] };
  const out: [string, number][] = [];
  const swapped: [string, string | null][] = [];
  for (const [id, g] of r.ing) {
    if (!avoid.has(id)) {
      out.push([id, g]);
      continue;
    }
    const i = ing.get(id);
    const alt = (i?.swaps ?? []).find((s) => !avoid.has(s) && !r.ing.some(([x]) => x === s) && !kosherProblem({ ing: [...r.ing.filter(([x]) => x !== id), [s, g]] }, ing));
    if (alt) {
      out.push([alt, g]);
      swapped.push([id, alt]);
    } else if (i && LITTLE.has(i.group)) swapped.push([id, null]);
    else return null;
  }
  return { recipe: { ...r, ing: out }, swapped };
}

/** 0 mild / 1 well spiced / 2 hot. */
export function spiceOf(r: Pick<Recipe, 'ing'>): 0 | 1 | 2 {
  const ids = new Set(r.ing.map(([id]) => id));
  if (ids.has('chili') || ids.has('chili-flakes') || ids.has('hawaij')) return 2;
  return ['paprika', 'cumin', 'baharat', 'zaatar', 'turmeric', 'sumac', 'ginger', 'garlic'].some((x) => ids.has(x)) ? 1 : 0;
}

/** The dish's main protein (for variety): poultry, meat, fish, egg, dairy, legume or none. */
export function mainProtein(r: Pick<Recipe, 'ing'>, ing: Map<string, Ingredient>): string {
  const by = new Map<string, number>();
  for (const [id, g] of r.ing) {
    const i = ing.get(id);
    if (!i) continue;
    const k = i.group === 'egg' ? 'egg' : i.group === 'dairy' ? (i.id === 'butter' ? '' : 'dairy') : ['poultry', 'meat', 'fish', 'legume'].includes(i.group) ? i.group : '';
    if (k) by.set(k, (by.get(k) ?? 0) + g);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
}

/** Grams of vegetables, fruit and legumes in the dish. */
export function plantGrams(r: Pick<Recipe, 'ing'>, ing: Map<string, Ingredient>) {
  return r.ing.reduce((a, [id, g]) => {
    const grp = ing.get(id)?.group;
    return a + (grp === 'veg' || grp === 'fruit' || grp === 'legume' || grp === 'herb' ? g : 0);
  }, 0);
}

/** Healthy mark of a home-cooked dish: Nutri-Score 2023 per 100 g (fruit/veg/legume share from its ingredients). */
export function dishGrade(n: Nutrients, plantG: number) {
  if (!n.grams) return null;
  const k = 100 / n.grams;
  return nutriScore(
    { kcal: n.kcal * k, protein: n.protein * k, fat: n.fat * k, carbs: n.carbs * k, sugars: n.sugars * k, fiber: n.fiber * k, satFat: n.satFat * k, sodium: n.sodium * k },
    { kind: 'food', fvl: Math.min(100, (plantG / n.grams) * 100) },
  )?.grade ?? null;
}

// ---------------------------------------------------------------- scoring

export interface DayIntake {
  kcal: number;
  protein: number;
  fiber: number;
  /** Logged foods today (with tags / names). */
  foods: Pick<HealthFood, 'date' | 'time' | 'text' | 'product' | 'productId' | 'tags' | 'kcal' | 'deletedAt'>[];
}

export interface SuggestInput {
  recipes: Recipe[];
  ing: Map<string, Ingredient>;
  db: FoodsIL;
  now: Date;
  /** Today's food + yesterday's (for the kosher clock). */
  today: DayIntake;
  yesterday?: DayIntake['foods'];
  /** Kitchen recipe ids eaten in the last days (newest first), for variety. */
  recentRecipes?: string[];
  /** Main proteins already eaten today (from recipes) */
  goals?: { kcal: number; protein: number; fiber: number } | null;
  weightKg?: number | null;
  taste: Taste;
  slot?: Slot;
  crave?: string | null;
  /** "My fridge": what's at home. */
  fridge?: string[] | null;
  /** Extra points by main protein (week plan: no same protein two days running, red meat <= 2 a week, fish >= 2). */
  mainBias?: Record<string, number>;
}

export type Why = 'protein' | 'light' | 'fits' | 'fiber' | 'veg' | 'notFried' | 'healthy' | 'taste' | 'liked' | 'variety' | 'quick' | 'crave' | 'fridge' | 'noDairy' | 'noMeat';

export interface Suggestion {
  recipe: Recipe;
  serving: Nutrients;
  kosher: Kosher;
  grade: ReturnType<typeof dishGrade>;
  score: number;
  why: Why[];
  swapped: [string, string | null][];
  /** Fridge mode: ingredients that are missing (not counting spices/oil/salt). */
  missing?: string[];
}

const FRIED_WORDS = /מטוגן|טוגנים|צ'יפס|צ׳יפס|שניצל|פלאפל|fried|fries|chips|schnitzel|falafel|nuggets|tempura/i;
const STAPLE = new Set(['spice', 'herb', 'fat', 'sauce']);
/** Ingredients most kitchens have (not "missing" in My fridge). */
export const isStaple = (i: Ingredient | undefined) => !!i && (STAPLE.has(i.group) || ['salt', 'sugar', 'baking-powder', 'flour', 'lemon-juice', 'garlic', 'onion', 'honey'].includes(i.id));

/** All recipes that can be suggested now, best first, each with its reasons. */
export function suggest(x: SuggestInput): Suggestion[] {
  const { ing, db, now, today, taste } = x;
  const goals = x.goals ?? null;
  const kcalLeft = goals ? goals.kcal - today.kcal : null;
  const slot = x.slot ?? slotFor(now, kcalLeft);
  const clock = kosherClock([...(x.yesterday ?? []), ...today.foods], now);
  const avoid = new Set([...taste.never, ...taste.allergies.flatMap((a) => ALLERGIES[a] ?? [])]);
  const friedToday = today.foods.some((f) => !f.deletedAt && ((f.tags ?? []).includes('fried') || FRIED_WORDS.test(`${f.text} ${f.product ?? ''}`)));
  const recent = x.recentRecipes ?? [];
  // Meals still to come today (incl. this one), for spreading what's left.
  const h = now.getHours();
  const mealsLeft = slot === 'snack' ? 1 : h < 11 ? 3 : h < 16 ? 2 : 1;
  const proteinLeft = goals ? Math.max(0, goals.protein - today.protein) : null;
  // ~0.4 g/kg a meal, more when the day is behind, but no more than ~0.6 g/kg
  // (the upper per-meal amount in the same paper; the rest goes to later meals / snacks).
  const pMin = x.weightKg ? 0.4 * x.weightKg : 25;
  const pMax = x.weightKg ? 0.6 * x.weightKg : 40;
  const perMealProtein = Math.min(pMax, Math.max(pMin, proteinLeft != null ? proteinLeft / mealsLeft : 0));
  const kcalTarget = kcalLeft != null ? Math.max(150, kcalLeft / mealsLeft) : slot === 'snack' ? 200 : slot === 'breakfast' ? 450 : 600;
  const proteinsToday = new Set<string>(
    today.foods
      .filter((f) => !f.deletedAt)
      .map((f) => {
        const t = `${f.text} ${f.product ?? ''}`;
        return /עוף|הודו|פרגית|chicken|turkey|שניצל|schnitzel/i.test(t) ? 'poultry' : /בקר|כבש|טלה|beef|lamb|steak|סטייק|המבורגר|burger|קבב|kebab/i.test(t) ? 'meat' : /דג|סלמון|טונה|fish|salmon|tuna/i.test(t) ? 'fish' : '';
      })
      .filter(Boolean),
  );
  const out: Suggestion[] = [];
  for (const base of x.recipes) {
    if (x.crave ? !base.crave?.includes(x.crave) : !base.meal.includes(slot)) continue;
    if (taste.rated[base.id] === -1) continue;
    if (taste.maxTime && base.time > taste.maxTime) continue;
    if (taste.level && base.level > taste.level) continue;
    const sw = applySwaps(base, avoid, ing);
    if (!sw) continue;
    const r = sw.recipe;
    const kosher = kosherOf(r, ing);
    if (kosher === 'dairy' && clock.noDairyUntil) continue;
    if (kosher === 'meat' && clock.noMeatUntil) continue;
    const { serving } = recipeNutrition(db, r, ing);
    const plants = plantGrams(r, ing) / r.servings;
    const grade = dishGrade(serving, plants);
    const fried = r.tags?.includes('fried') || r.method === 'fry';
    const why: Why[] = [];
    let s = 0;
    // Calories: close to what's left for this meal; never far over the day's goal.
    const kRatio = serving.kcal / kcalTarget;
    s -= Math.abs(1 - kRatio) * 3;
    if (kcalLeft != null && serving.kcal > kcalLeft + 150) s -= 6;
    else if (kcalLeft != null && kRatio <= 1.1) why.push(kcalLeft < 600 ? 'light' : 'fits');
    // Protein: enough for this meal (more points when the day is behind).
    const pRatio = Math.min(1.5, serving.protein / perMealProtein);
    s += (slot === 'snack' ? 1 : 3) * Math.min(1, pRatio);
    if (proteinLeft != null && proteinLeft > 30 && pRatio >= 0.9) {
      s += 2;
      why.push('protein');
    }
    // Fiber and vegetables.
    if (goals && goals.fiber - today.fiber > 10 && serving.fiber >= 8) {
      s += 1.5;
      why.push('fiber');
    }
    if (plants >= 150) {
      s += 1;
      why.push('veg');
    }
    // Fried: mostly not, never twice a day.
    if (fried) s -= friedToday ? 8 : 2;
    else if (friedToday) why.push('notFried');
    // Healthy dish (Nutri-Score A/B), sodium, sugars.
    const mark = markOf(grade);
    if (mark === 'healthy') {
      s += 1.5;
      why.push('healthy');
    } else if (mark === 'less') s -= 1.5;
    if (serving.sodium > 1000) s -= 1;
    if (serving.sugars * 4 > serving.kcal * 0.25 && slot !== 'snack') s -= 1;
    // Variety.
    const main = mainProtein(r, ing);
    if (main !== 'none' && main !== 'legume' && proteinsToday.has(main)) s -= 2;
    else if (proteinsToday.size && main !== 'none') why.push('variety');
    s += x.mainBias?.[main] ?? 0;
    const idx = recent.indexOf(base.id);
    if (idx >= 0) s -= idx < 3 ? 4 : 1.5;
    // Taste.
    if (taste.cuisines.includes(r.cuisine)) {
      s += 1.5;
      why.push('taste');
    }
    const sp = spiceOf(r);
    s -= Math.abs(sp - taste.spice) * 0.7;
    if (taste.rated[base.id] === 1) {
      s += 1.5;
      why.push('liked');
    }
    if (r.time <= 20) why.push('quick');
    if (x.crave) {
      why.unshift('crave');
      if (!fried) s += 3;
    }
    if (kosher !== 'dairy' && clock.noDairyUntil) why.push('noDairy');
    if (kosher !== 'meat' && clock.noMeatUntil) why.push('noMeat');
    let missing: string[] | undefined;
    if (x.fridge) {
      const have = new Set(x.fridge);
      missing = r.ing.map(([id]) => id).filter((id) => !have.has(id) && !isStaple(ing.get(id)));
      const main2 = r.ing.filter(([id]) => !isStaple(ing.get(id)));
      if (!main2.some(([id]) => have.has(id))) continue;
      s += 4 - Math.min(4, missing.length * 1.2);
      why.unshift('fridge');
    }
    out.push({ recipe: r, serving, kosher, grade, score: Math.round(s * 100) / 100, why: [...new Set(why)], swapped: sw.swapped, missing });
  }
  // Same order all day (stable), varied from day to day.
  const seed = Number(now.toISOString().slice(0, 10).replace(/-/g, ''));
  const jitter = (id: string) => {
    let h2 = seed;
    for (const c of id) h2 = (h2 * 31 + c.charCodeAt(0)) % 1000003;
    return (h2 % 100) / 250; // 0 - 0.4
  };
  return out.sort((a, b) => b.score + jitter(b.recipe.id) - (a.score + jitter(a.recipe.id)));
}

/**
 * A varied week of dinners (Plan > Fill the week). Each dinner is sized like a
 * normal day's dinner (~35% of the day's calories and protein; the rest is
 * eaten earlier). Variety rules: never the same dish twice, not the same main
 * protein two days running, red meat at most twice a week (WCRF/AICR: limit
 * red meat to ~350-500 g cooked a week), fish at least twice a week (Israeli
 * MoH 2019 / AHA), and a vegetarian (legume) dinner once.
 */
export function planWeek(x: Omit<SuggestInput, 'now' | 'today' | 'slot' | 'crave' | 'fridge' | 'mainBias'>, days: string[], already: Record<string, string[]>) {
  const plan: Record<string, string[]> = { ...already };
  const used: string[] = Object.values(plan).flat();
  const mains: string[] = [];
  const mainOf = new Map(x.recipes.map((r) => [r.id, mainProtein(r, x.ing)]));
  for (const d of days) {
    if (plan[d]?.length) {
      mains.push(mainOf.get(plan[d][0]) ?? 'none');
      continue;
    }
    const g = x.goals;
    const eaten = g ? { kcal: g.kcal * 0.65, protein: g.protein * 0.65, fiber: g.fiber * 0.6 } : { kcal: 0, protein: 0, fiber: 0 };
    const count = (m: string) => mains.filter((y) => y === m).length;
    const bias: Record<string, number> = {};
    const prev = mains[mains.length - 1];
    if (prev && prev !== 'none') bias[prev] = (bias[prev] ?? 0) - 6;
    if (count('meat') >= 2) bias.meat = (bias.meat ?? 0) - 6;
    if (count('fish') < 2) bias.fish = (bias.fish ?? 0) + 1.5;
    else bias.fish = (bias.fish ?? 0) - 1.5;
    if (count('legume') < 1) bias.legume = (bias.legume ?? 0) + 1;
    const list = suggest({ ...x, now: new Date(`${d}T19:00:00`), today: { ...eaten, foods: [] }, recentRecipes: [...used].reverse(), slot: 'dinner', mainBias: bias });
    const pick = list.find((s) => !used.includes(s.recipe.id));
    if (!pick) continue;
    plan[d] = [pick.recipe.id];
    used.push(pick.recipe.id);
    mains.push(mainOf.get(pick.recipe.id) ?? 'none');
  }
  return plan;
}

/** Amounts for `meals` portions (batch cooking / cooking for two). */
export function scaleRecipe(r: Recipe, meals: number): Recipe {
  const k = meals / r.servings;
  return { ...r, servings: meals, ing: r.ing.map(([id, g]) => [id, Math.round(g * k * 10) / 10]) };
}

// ---------------------------------------------------------------- amounts in kitchen words

/** Grams in one level teaspoon / tablespoon (USDA household measures; MoH spoon portions). */
const SPOON: Record<string, [number, number]> = {
  salt: [6, 18],
  sugar: [4, 12.5],
  'baking-powder': [4, 12],
  yeast: [3, 9],
  'olive-oil': [4.5, 13.5],
  'canola-oil': [4.5, 13.5],
  honey: [7, 21],
  silan: [7, 21],
  tahini: [5, 15],
  'peanut-butter': [5.3, 16],
  'soy-sauce': [5.3, 16],
  'lemon-juice': [5, 15],
  vinegar: [5, 15],
  balsamic: [5, 15],
  mustard: [5, 15],
  'mayo-light': [5, 15],
  'tomato-paste': [5.5, 16],
  cocoa: [2.5, 7.5],
  sesame: [3, 9],
  'garlic-powder': [3, 9],
  'onion-powder': [2.4, 7],
};

export type KitchenAmount = { n: number; unit: 'tsp' | 'tbsp' | 'piece' | 'g' | 'ml'; grams: number; approx: boolean };

const quarter = (x: number) => Math.round(x * 4) / 4;
const half = (x: number) => Math.round(x * 2) / 2;

/** "2 eggs", "1½ tbsp", "300 g" — how a recipe says an amount. */
export function kitchenAmount(i: Ingredient | undefined, g: number): KitchenAmount {
  const grams = Math.round(g);
  if (!i) return { n: grams, unit: 'g', grams, approx: false };
  if (i.piece && g >= i.piece * 0.45) {
    const n = half(g / i.piece);
    if (n >= 0.5 && n <= 12) return { n, unit: 'piece', grams, approx: true };
  }
  const sp = SPOON[i.id] ?? (i.group === 'spice' ? [2.5, 7.5] : i.group === 'fat' ? [4.5, 13.5] : null);
  if (sp && g <= sp[1] * 4) {
    if (g >= sp[1] * 0.9) return { n: half(g / sp[1]), unit: 'tbsp', grams, approx: true };
    return { n: Math.max(0.25, quarter(g / sp[0])), unit: 'tsp', grams, approx: true };
  }
  if (i.id === 'broth' || i.id === 'chicken-broth' || i.id === 'milk' || i.id === 'soy-drink' || i.id === 'coconut-milk') return { n: grams, unit: 'ml', grams, approx: false };
  return { n: grams, unit: 'g', grams, approx: false };
}

/** Shopping list: what the planned dishes need (grams per ingredient), x batch. */
export function shoppingNeeds(recipes: Recipe[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of recipes) for (const [id, g] of r.ing) m.set(id, (m.get(id) ?? 0) + g);
  return m;
}
