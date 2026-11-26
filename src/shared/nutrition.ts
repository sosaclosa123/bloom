// Healthy / less healthy, red labels and ml for foods (owner, Nov 2026: "auto
// detect by logic first, I can change it"). Pure logic, no network.
//
// Sources:
//  - Healthy score = Nutri-Score, 2023 update (Santé publique France / the
//    Nutri-Score scientific committee 2022-2023; Merz et al., Nature Food
//    2024). Thresholds copied from the reference implementation used by Open
//    Food Facts (openfoodfacts-server, lib/ProductOpener/Nutriscore.pm,
//    %points_thresholds_2023 and compute_nutriscore_grade_2023).
//    A/B = healthy, C = in between (no mark), D/E = less healthy.
//  - Red labels = Israeli Ministry of Health front-of-package warnings
//    (Public Health Regulations (Food) (Nutritional Labeling) 2017, second
//    stage from 2020/2021): per 100 g solid: sodium > 400 mg, sugars > 10 g,
//    saturated fat > 4 g; per 100 ml liquid: sodium > 300 mg, sugars > 5 g,
//    saturated fat > 3 g. Single, unprocessed foods (fruit, vegetables, plain
//    milk, eggs, legumes, nuts) are exempt, as in the regulation.
//  - ml: the MoH database gives each food's weight of a 240 ml cup, so its
//    density is cup grams / 240 (olive oil 216 g = 0.9 g/ml, honey 339 g =
//    1.41 g/ml); no cup = 1 g/ml (marked as an estimate).

/** Nutrition per 100 g (or 100 ml for drinks). Missing values count as 0, like the official rule. */
export interface Per100 {
  kcal: number;
  protein: number;
  fat?: number;
  carbs?: number;
  sugars?: number | null;
  fiber?: number | null;
  satFat?: number | null;
  /** mg */
  sodium?: number | null;
}

/** How the Nutri-Score treats the food. */
export type ScoreKind = 'food' | 'drink' | 'water' | 'fat' | 'none';

export interface FoodFacts {
  kind: ScoreKind;
  /** Fruit, vegetables and legumes (%), as far as the data tells. */
  fvl: number;
  cheese?: boolean;
  redMeat?: boolean;
  /** Sold as one plain food: no red labels (fruit, veg, plain milk, eggs, legumes, nuts). */
  single?: boolean;
  /** Liquid: ml amounts and the liquid red-label limits. */
  liquid?: boolean;
}

const T = {
  energy: [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350], // kJ
  energyDrink: [30, 90, 150, 210, 240, 270, 300, 330, 360, 390],
  sugars: [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51],
  sugarsDrink: [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11],
  satFat: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  salt: [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4],
  energySat: [120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200], // kJ from saturated fat
  satRatio: [10, 16, 22, 28, 34, 40, 46, 52, 58, 64], // %
  fvl: [40, 60, 80, 80, 80],
  fvlDrink: [40, 40, 60, 60, 80, 80],
  fiber: [3.0, 4.1, 5.2, 6.3, 7.4],
  protein: [2.4, 4.8, 7.2, 9.6, 12, 14, 17],
  proteinDrink: [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0],
};
const pts = (v: number, list: number[], orEqual = false) => list.filter((t) => (orEqual ? v >= t : v > t)).length;

export type Grade = 'a' | 'b' | 'c' | 'd' | 'e';

/** Nutri-Score 2023: score (lower = better) and grade; null = not scored (spices, alcohol…). */
export function nutriScore(p: Per100, f: FoodFacts): { score: number; grade: Grade } | null {
  if (f.kind === 'none') return null;
  if (f.kind === 'water') return { score: -15, grade: 'a' };
  const drink = f.kind === 'drink';
  const fatCat = f.kind === 'fat';
  const kj = (p.kcal || 0) * 4.184;
  const sat = p.satFat || 0;
  const salt = ((p.sodium || 0) * 2.5) / 1000; // g salt = sodium x 2.5
  const neg =
    (fatCat ? pts(sat * 37, T.energySat) : pts(kj, drink ? T.energyDrink : T.energy)) +
    pts(p.sugars || 0, drink ? T.sugarsDrink : T.sugars) +
    (fatCat ? pts(p.fat ? (sat / p.fat) * 100 : 0, T.satRatio, true) : pts(sat, T.satFat)) +
    pts(salt, T.salt);
  let protein = pts(p.protein || 0, drink ? T.proteinDrink : T.protein);
  if (f.redMeat) protein = Math.min(protein, 2);
  const countProtein = drink || f.cheese || (fatCat ? neg < 7 : neg < 11);
  const pos = (countProtein ? protein : 0) + pts(p.fiber || 0, T.fiber) + pts(f.fvl, drink ? T.fvlDrink : T.fvl);
  const score = neg - pos;
  const cut = drink ? [-Infinity, 2, 6, 9] : fatCat ? [-6, 2, 10, 18] : [0, 2, 10, 18];
  const grade: Grade = drink
    ? score <= 2
      ? 'b'
      : score <= 6
        ? 'c'
        : score <= 9
          ? 'd'
          : 'e'
    : score <= cut[0]
      ? 'a'
      : score <= cut[1]
        ? 'b'
        : score <= cut[2]
          ? 'c'
          : score <= cut[3]
            ? 'd'
            : 'e';
  return { score, grade };
}

export type HealthMark = 'healthy' | 'less';
/** A/B = healthy, D/E = less healthy, C = in between (no mark). */
export const markOf = (g: Grade | null | undefined): HealthMark | null => (!g ? null : g === 'a' || g === 'b' ? 'healthy' : g === 'd' || g === 'e' ? 'less' : null);

export type RedLabel = 'sugar' | 'sodium' | 'satFat';
/** Israeli MoH red warning labels for a food (per 100 g / 100 ml). */
export function redLabels(p: Per100, f: Pick<FoodFacts, 'liquid' | 'single' | 'kind'>): RedLabel[] {
  if (f.single || f.kind === 'water') return [];
  const [na, sug, sat] = f.liquid ? [300, 5, 3] : [400, 10, 4];
  const out: RedLabel[] = [];
  if ((p.sugars || 0) > sug) out.push('sugar');
  if ((p.sodium || 0) > na) out.push('sodium');
  if ((p.satFat || 0) > sat) out.push('satFat');
  return out;
}

// ---------------------------------------------------------------- what kind of food (MoH database)

const LIQUID_WORDS = /(^|[\s,])(liquid|drink|beverage|juice|nectar|milk|soup|broth|coffee|tea|cola|soda|lemonade|smoothie|shake|kefir|leben|formula|water|beer|wine|liqueur|cocktail|vodka|whisky|arak)([\s,]|$)|נוזל|משקה|מיץ|נקטר|חלב|מרק|ציר|קפה|תה|קולה|סודה|לימונדה|שייק|קפיר|לבן|תרכובת|מים|בירה|יין/i;
const NOT_LIQUID = /powder|dried|dry|bar|chocolate,|cheese|flour|bread|cake|cookie|pudding|ice cream|cream cheese|אבקה|מיובש|יבש|חטיף|גבינה|קמח|לחם|עוגה|עוגייה|פודינג|גלידה/i;

/**
 * Facts for a MoH food from its code (first digits = food group) and name.
 * Groups: 11 milk, 12 cream, 13 ice cream, 14 cheese, 21-23/25 red meat and
 * offal, 24 poultry, 26 fish, 3x eggs, 41 legumes, 42-43 nuts/seeds, 5x
 * grains, 61-67 fruit, 7x vegetables, 81-83 fats/oils/dressings, 91 sugars,
 * 92 drinks, 93 alcohol, 94 water, 95 spices.
 */
export function ilFacts(code: number, nameEn: string, nameHe = '', per100?: Per100): FoodFacts {
  const c = String(code);
  const g2 = c.slice(0, 2);
  const g1 = c[0];
  const name = `${nameEn} ${nameHe}`;
  const liquid = (g2 === '11' && !/yogh?urt|יוגורט|pudding|פודינג/i.test(name)) || ['64', '92', '93', '94'].includes(g2) || (LIQUID_WORDS.test(name) && !NOT_LIQUID.test(name));
  if (g2 === '94') return { kind: /flavou?r|טעם/i.test(name) ? 'drink' : 'water', fvl: 0, liquid: true, single: true };
  if (g2 === '93' || g2 === '95' || /^salt|baking (powder|soda)|yeast|gelatin|^spices/i.test(nameEn)) return { kind: 'none', fvl: 0, liquid, single: true };
  const fatCat = ['42', '43', '81', '82', '83'].includes(g2) || /^oil,|^butter|margarine|tahini|טחינה/i.test(nameEn + ' ' + nameHe);
  const veg = g1 === '7' || ['61', '62', '63', '64', '65', '67'].includes(g2);
  const legume = g2 === '41' && !/drink|soy drink|משקה|formula|supplement|ensure/i.test(name);
  // Fruit, vegetables and legumes: plain ones count fully; cooked with lots of fat about half.
  const fat = per100?.fat ?? 0;
  // Olive, rapeseed (canola) and walnut oils count here too (Nutri-Score rule).
  const goodOil = g2 === '82' && /olive|canola|rapeseed|walnut|זית|קנולה|אגוזי מלך/i.test(name);
  const fvl = goodOil ? 100 : veg || legume ? (fat > 8 ? 50 : 100) : 0;
  const plainMilk = g2 === '11' && /^milk, (cow|goat|sheep)/i.test(nameEn) && !/flavou?r|chocolate|sweet/i.test(nameEn);
  const simple = /raw|fresh|plain|unsalted|not salted|boiled|dried|frozen|טרי|חי|מבושל|לא קלוי|ללא מלח/i.test(name) && !/fried|sauce|salad, with|with (sugar|honey|oil)|מטוגן|ברוטב|עם סוכר/i.test(name);
  const single = plainMilk || (g1 === '3' && simple) || ((veg || legume || ['42', '43'].includes(g2)) && simple);
  return {
    kind: liquid ? 'drink' : fatCat ? 'fat' : 'food',
    fvl,
    cheese: g2 === '14',
    redMeat: ['21', '22', '23', '25'].includes(g2),
    single,
    liquid,
  };
}

/** Grams per ml from the food's 240 ml cup weight (null = not known, use 1 g/ml as an estimate). */
export function densityOf(portions: { unit?: number; grams: number }[] | [number, number][]): number | null {
  for (const p of portions as unknown[]) {
    const [unit, grams] = Array.isArray(p) ? (p as [number, number]) : [(p as { unit?: number }).unit, (p as { grams: number }).grams];
    if ((unit === 200 || unit === 201) && grams > 0) {
      const d = grams / 240;
      if (d >= 0.5 && d <= 1.6) return Math.round(d * 1000) / 1000;
    }
  }
  return null;
}

/** ml -> grams (density known, else 1 g/ml). */
export const mlToGrams = (ml: number, density: number | null | undefined) => Math.round(ml * (density || 1) * 10) / 10;
