// Food: searching foods, portions and calories (pure logic, no network).
//  - Offline: the Israeli Ministry of Health national nutrition database
//    (src/data/foods-il.json, built by scripts/fetch-foods-il.mjs).
//  - Online (if turned on): Open Food Facts products, also by barcode.
// Values are per 100 g; a logged item stores its own grams and totals.

import type { FoodLabel, HealthFood, HealthMyProduct, HealthRecipe, RecipeItem } from './types';
import { densityOf, ilFacts, markOf, nutriScore, redLabels, type Grade, type RedLabel } from './nutrition';
export interface FoodProduct {
  id: string; // 'il:<code>' or 'off:<barcode>'
  source: 'il' | 'off';
  name: string; // in the current language when available
  nameAlt: string; // the other language (shown small)
  brand: string;
  kcal: number; // per 100 g
  protein: number;
  fat: number;
  carbs: number;
  sugars?: number;
  fiber?: number;
  /** Saturated fat (g) and sodium (mg) per 100 g, when known. */
  satFat?: number;
  sodium?: number;
  /** Healthy score (Nutri-Score 2023, see nutrition.ts) and Israeli red labels. */
  grade?: Grade | null;
  red?: RedLabel[];
  /** Liquid: amounts in ml; grams per ml (null = unknown, 1 g/ml estimate). */
  liquid?: boolean;
  density?: number | null;
  /** Typical portions: label + grams (+ the MoH unit code: 300 tablespoon, 802 medium portion…). */
  portions: { label: string; grams: number; unit?: number }[];
  barcode?: string;
  /** Weight of one piece (cookie, cracker…) when the data says so. */
  pieceG?: number | null;
  /** Weight of the whole box / pack when the data says so. */
  packG?: number | null;
  /** Values from your own package label ("my product"). */
  mine?: boolean;
  /** Values another Bloom user copied from the package (shared library). */
  shared?: boolean;
}

export interface FoodsIL {
  source: string;
  units: Record<string, [string, string]>; // code -> [he, en]
  /** code, Hebrew, English, kcal, protein, fat, carbs, portions, sugars, fiber, saturated fat, sodium mg (per 100 g) */
  foods: [number, string, string, number, number, number, number, [number, number][], number?, number?, number?, number?][];
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ̀-ͯ]/g, '') // Hebrew points, accents
    .replace(/["'״׳`]/g, '')
    .replace(/[,()\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Olive oil in the MoH database (for "+ oil"). */
export const OLIVE_OIL = 82104000;

/** A MoH food by its code. */
export function ilByCode(db: FoodsIL, code: number, lang: 'en' | 'he'): FoodProduct | null {
  const row = db.foods.find((r) => r[0] === code);
  return row ? ilProduct(db, row, lang) : null;
}

export function ilProduct(db: FoodsIL, row: FoodsIL['foods'][number], lang: 'en' | 'he'): FoodProduct {
  const [code, he, en, kcal, protein, fat, carbs, portions, sugars, fiber, satFat, sodium] = row;
  const per = { kcal, protein, fat, carbs, sugars, fiber, satFat, sodium };
  const facts = ilFacts(code, en, he, per);
  return {
    id: `il:${code}`,
    source: 'il',
    name: lang === 'he' ? he : en || he,
    nameAlt: lang === 'he' ? en : he,
    brand: '',
    kcal,
    protein,
    fat,
    carbs,
    sugars: sugars ?? undefined,
    fiber: fiber ?? undefined,
    satFat: satFat ?? undefined,
    sodium: sodium ?? undefined,
    grade: nutriScore(per, facts)?.grade ?? null,
    red: redLabels(per, facts),
    liquid: !!facts.liquid,
    density: densityOf(portions),
    portions: portions
      .filter(([u]) => db.units[u])
      .map(([u, grams]) => ({ label: db.units[u][lang === 'he' ? 0 : 1], grams, unit: u })),
    pieceG: ilUnit(portions, PIECE_UNITS),
    packG: ilUnit(portions, PACK_UNITS),
  };
}

// MoH portion unit codes: "piece" (100, medium 103, small 102…, candy, mini
// snack) and whole packages (package, pack, bag, box…).
const PIECE_UNITS = [100, 103, 102, 104, 101, 105, 1225, 1220];
const PACK_UNITS = [900, 901, 906, 903, 902, 912, 911];
function ilUnit(portions: [number, number][], codes: number[]): number | null {
  for (const c of codes) {
    const hit = portions.find(([u]) => u === c);
    if (hit && hit[1] > 0) return hit[1];
  }
  return null;
}

// Everyday names for products the database lists under their general name
// (e.g. "coke" -> the database's cola entry). Each alias adds a search.
// [everyday names, database search, preferred words (brand), avoid words]
const ALIASES: [string[], string, RegExp?, RegExp?][] = [
  [['coke zero', 'diet coke', 'cola zero', 'pepsi max', 'קולה זירו', 'קוקה קולה זירו', 'קולה דיאט', 'פפסי מקס'], 'cola sugar'],
  [['coke', 'coca cola', 'cocacola', 'pepsi', 'cola', 'קוקה קולה', 'קוקה', 'פפסי', 'קולה'], 'cola', /coca|pepsi|קוקה|פפסי/, /sugar free|ללא סוכר|דיאט|diet|decaf|נטול/],
  [['sprite', 'fanta', '7up', 'seven up', 'ספרייט', 'פאנטה', 'סבן אפ'], 'sprite'],
  [['latte', 'cappuccino', 'cafe au lait', 'הפוך', 'קפה הפוך', 'לאטה', 'קפוצינו'], 'cappuccino'],
  [['nescafe', 'instant coffee', 'נס קפה', 'נסקפה', 'קפה נמס'], 'coffee prepared instant'],
  [['red bull', 'xl', 'רד בול', 'משקה אנרגיה'], 'energy drink'],
  [['ice tea', 'iced tea', 'nestea', 'fuze', 'אייס טי', 'תה קר', 'נסטי'], 'iced tea'],
  [['black coffee', 'turkish coffee', 'קפה שחור', 'קפה טורקי'], 'coffee turkish'],
];

function aliasQueries(q: string): { query: string; prefer?: RegExp; avoid?: RegExp }[] {
  // Exact everyday names win (so "coke" doesn't also mean "coke zero"); otherwise names being typed.
  // The longest matching everyday name decides ("coke zero" is not also "coke").
  const len = (names: string[]) => Math.max(0, ...names.filter((n) => q === n || q.startsWith(n + ' ')).map((n) => n.length));
  const top = Math.max(0, ...ALIASES.map(([names]) => len(names)));
  const exact = top ? ALIASES.filter(([names]) => len(names) === top) : [];
  const list = exact.length ? exact : ALIASES.filter(([names]) => names.some((n) => n.length >= 4 && q.length >= 3 && n.startsWith(q)));
  return list.map(([, query, prefer, avoid]) => ({ query, prefer, avoid: avoid && !avoid.test(q) ? avoid : undefined }));
}

/** Words that mark a drink (for the Drinks area). */
const DRINK_WORDS = ['משקה', 'מיץ', 'נקטר', 'קפה', 'תה', 'חלב', 'בירה', 'יין', 'וודקה', 'ויסקי', 'לימונדה', 'מילקשייק', 'סחלב', 'קולה', 'שוקו', 'drink', 'juice', 'nectar', 'coffee', 'tea', 'milk', 'beer', 'wine', 'vodka', 'whisky', 'lemonade', 'milkshake', 'soda', 'cola', 'beverage', 'cappuccino', 'espresso'];

/**
 * Offline search: every word must appear in the Hebrew or English name.
 * Real products first: a match on the brand / product name (the part after
 * the last comma, e.g. "..., Snickers") ranks first, then names starting with
 * the query, then simpler names. Everyday names (coke, latte...) also find the
 * database's entry for them. `drinks`: drinks first, plain water left out.
 */
export function searchIL(db: FoodsIL, query: string, lang: 'en' | 'he', limit = 12, opts: { drinks?: boolean } = {}): FoodProduct[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const best = new Map<FoodsIL['foods'][number], number>();
  const run = (qq: string, bonus: number, prefer?: RegExp, avoid?: RegExp) => {
    const words = qq.split(' ');
    // What people usually mean: cooked / ready to eat, plain. Raw, flour, oil
    // and survey ("FFQ") entries go lower unless asked for.
    const LOWER = ['uncooked', 'dry', 'dried', 'powder', 'flour', 'oil', 'ffq', 'with peel', 'לא מבושל', 'יבש', 'מיובש', 'אבקה', 'קמח', 'שמן', 'מאבקה', 'עם קליפה'].filter((w) => !qq.includes(w));
    for (const row of db.foods) {
      const he = norm(row[1]);
      const en = norm(row[2]);
      if (!words.every((w) => he.includes(w) || en.includes(w))) continue;
      const name = lang === 'he' ? he : en || he;
      const tokens = name.split(' ');
      // Water is counted on the Today tab, not here (sweetened tonic etc. still shows).
      if (opts.drinks && /^(water|מים)( |$)/.test(name) && !(/tonic|טוניק/.test(name) || (/ממותק|sweetened/.test(name) && !/לא ממותק|unsweetened/.test(name)))) continue;
      const starts = he.startsWith(qq) || en.startsWith(qq) ? 0 : 1;
      const whole = words.every((w) => tokens.includes(w) || he.split(' ').includes(w) || en.split(' ').includes(w)) ? 0 : 40;
      const extra = tokens.filter((w) => !words.includes(w)).length;
      const lower = LOWER.some((w) => (w.includes(' ') ? ` ${name} `.includes(` ${w} `) : tokens.some((x) => x.startsWith(w)))) ? 25 : 0;
      // Brand / product part: after the last comma of the original name.
      const brand = [row[1], row[2]].map((x) => norm(x.split(',').slice(1).pop() ?? '')).join(' ');
      const brandHit = brand && words.some((w) => w.length >= 3 && brand.split(' ').some((b) => b.startsWith(w))) ? -60 : 0;
      const drink = opts.drinks ? (DRINK_WORDS.some((w) => he.split(' ').includes(w) || en.split(' ').includes(w)) ? -45 : 30) : 0;
      const pref = (prefer && (prefer.test(he) || prefer.test(en)) ? -30 : 0) + (avoid && (avoid.test(he) || avoid.test(en)) ? 25 : 0);
      const score = bonus + pref + brandHit + drink + starts * 100 + whole + extra * 3 + lower + name.length / 100;
      if (!best.has(row) || score < best.get(row)!) best.set(row, score);
    }
  };
  run(q, 0);
  for (const a of aliasQueries(q)) run(a.query, -80, a.prefer, a.avoid); // what the everyday name means comes first
  return [...best.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([row]) => ilProduct(db, row, lang));
}

// ---------------------------------------------------------------- automatic food tags
//
// From the name and the nutrients per 100 g. Thresholds: UK FSA "traffic
// light" front-of-pack guidance (high fat > 17.5 g, high sugars > 22.5 g per
// 100 g food), the UK Soft Drinks Industry Levy line for sugary drinks
// (>= 5 g sugars per 100 ml) and the EU "high fibre" claim (>= 6 g per 100 g,
// Regulation (EC) 1924/2006).
const TAG_WORDS: Record<string, string[]> = {
  fried: ['מטוגן', 'מטוגנת', 'מטוגנים', 'טוגנים', 'צ\'יפס', 'שניצל', 'פלאפל', 'fried', 'fries', 'chips', 'schnitzel', 'falafel', 'tempura', 'nuggets', 'ביסלי', 'בורקס'],
  dairy: ['חלב', 'גבינה', 'גבינת', 'יוגורט', 'שמנת', 'חמאה', 'קוטג', 'לבנה', 'מעדן', 'גלידה', 'שוקו', 'milk', 'cheese', 'yogurt', 'yoghurt', 'cream', 'butter', 'cottage', 'labane', 'ice cream', 'milkshake', 'latte', 'cappuccino', 'קפוצינו'],
  gluten: ['לחם', 'לחמניה', 'פיתה', 'פסטה', 'ספגטי', 'עוגה', 'עוגיות', 'עוגיה', 'בורקס', 'בצק', 'חיטה', 'שעורה', 'שיפון', 'קרקר', 'פתיתים', 'קוסקוס', 'בייגלה', 'ביסלי', 'פיצה', 'שניצל', 'bread', 'bun', 'pita', 'pasta', 'spaghetti', 'cake', 'cookie', 'cookies', 'wheat', 'barley', 'rye', 'cracker', 'couscous', 'pretzel', 'pizza', 'wafer', 'beer', 'בירה'],
  spicy: ['חריף', 'חריפה', 'צילי', 'חריסה', 'סחוג', 'spicy', 'chili', 'chilli', 'harissa', 'hot sauce', 'jalapeno'],
  alcohol: ['בירה', 'יין', 'וודקה', 'ערק', 'ויסקי', 'beer', 'wine', 'vodka', 'arak', 'whisky', 'liqueur'],
  caffeine: ['קפה', 'קולה', 'אספרסו', 'משקה אנרגיה', 'תה', 'coffee', 'cola', 'espresso', 'energy drink', 'tea', 'cappuccino', 'קפוצינו', 'red bull'],
  redmeat: ['בקר', 'כבש', 'טלה', 'סטייק', 'המבורגר', 'קבב', 'אנטריקוט', 'beef', 'lamb', 'steak', 'hamburger', 'kebab', 'veal'],
};

export function autoTags(p: Pick<FoodProduct, 'name' | 'nameAlt' | 'fat' | 'sugars' | 'fiber'>, drink = false): string[] {
  const text = ` ${norm(`${p.name} ${p.nameAlt}`)} `;
  const no = (w: string) => text.includes(`ללא ${w}`) || text.includes(`נטול ${w}`) || text.includes(`no ${w}`) || text.includes(`${w} free`) || text.includes(`decaffeinated`) && w === 'caffeine';
  const out: string[] = [];
  for (const [tag, words] of Object.entries(TAG_WORDS)) {
    if (tag === 'caffeine' && /decaf|נטול קפאין|ללא קפאין/.test(text)) continue;
    if (tag === 'gluten' && /gluten free|ללא גלוטן/.test(text)) continue;
    if (words.some((w) => text.includes(` ${norm(w)}`) || text.includes(`${norm(w)} `))) out.push(tag);
  }
  void no;
  if ((p.fat ?? 0) > 17.5) out.push('fatty');
  if ((p.sugars ?? 0) >= (drink ? 5 : 22.5) && (drink || (p.sugars ?? 0) > 22.5)) out.push('sugar');
  if ((p.fiber ?? 0) >= 6) out.push('fiber');
  return [...new Set(out)];
}

/** Open Food Facts product JSON -> FoodProduct (null when it has no calories). */
export function parseOff(p: Record<string, unknown> | null | undefined, lang: 'en' | 'he'): FoodProduct | null {
  if (!p) return null;
  const n = (p.nutriments ?? {}) as Record<string, number | string | undefined>;
  const num = (k: string) => {
    const v = Number(n[k]);
    return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
  };
  let kcal = num('energy-kcal_100g');
  if (!kcal && num('energy_100g')) kcal = Math.round(num('energy_100g') / 4.184); // kJ -> kcal
  const he = String(p.product_name_he ?? '').trim();
  const en = String(p.product_name_en ?? '').trim();
  const any = String(p.product_name ?? '').trim();
  const name = (lang === 'he' ? he || any || en : en || any || he) || String(p.code ?? '');
  if (!kcal) return null;
  const serving = Number(p.serving_quantity);
  const servingText = String(p.serving_size ?? '').trim();
  const parsed = parseServing(servingText);
  const pack = Number(p.product_quantity);
  const packUnit = String(p.product_quantity_unit ?? 'g').toLowerCase();
  const out: FoodProduct = {
    id: `off:${p.code}`,
    source: 'off',
    name,
    nameAlt: lang === 'he' ? en || (any !== name ? any : '') : he,
    brand: String(p.brands ?? '').split(',')[0].trim(),
    kcal,
    protein: num('proteins_100g'),
    fat: num('fat_100g'),
    carbs: num('carbohydrates_100g'),
    sugars: num('sugars_100g'),
    fiber: num('fiber_100g'),
    satFat: num('saturated-fat_100g'),
    sodium: Math.round(Number(n['sodium_100g'] ?? 0) * 1000) || 0,
    // Open Food Facts' own Nutri-Score (it knows the product's category); liquids are labeled per 100 ml.
    grade: /^[a-e]$/.test(String(p.nutriscore_grade ?? '')) ? (String(p.nutriscore_grade) as Grade) : null,
    liquid: packUnit === 'ml' || packUnit === 'l' || /beverages|drinks|משקאות/.test(String(p.categories_tags ?? '')),
    density: packUnit === 'ml' || packUnit === 'l' ? 1 : null,
    portions: Number.isFinite(serving) && serving > 0 ? [{ label: String(p.serving_size ?? '').trim() || `${serving} g`, grams: serving }] : [],
    barcode: String(p.code ?? ''),
    pieceG: parsed ? Math.round((parsed.grams / parsed.count) * 10) / 10 : null,
    packG: Number.isFinite(pack) && pack > 0 && pack <= 5000 && (packUnit === 'g' || packUnit === 'ml') ? pack : null,
  };
  // Red labels from the values; a grade from the values when Open Food Facts has none.
  const per = { kcal: out.kcal, protein: out.protein, fat: out.fat, carbs: out.carbs, sugars: out.sugars, fiber: out.fiber, satFat: out.satFat, sodium: out.sodium };
  const kind = out.liquid ? 'drink' : 'food';
  out.red = redLabels(per, { kind, liquid: out.liquid });
  if (!out.grade) out.grade = nutriScore(per, { kind, fvl: 0 })?.grade ?? null;
  return out;
}

// ---------------------------------------------------------------- pieces ("I ate 5 cookies")
//
// Calories need grams, so "5 cookies" needs the weight of one. In order:
// what you told the app for this product (box weight ÷ pieces in the box),
// the product data ("3 biscuits (30 g)" on the label; MoH "piece" portion),
// then a typical weight for that kind of food (shown with ≈).

/** "3 biscuits (30 g)", "1 cookie (12g)", "2 עוגיות (25 גרם)" -> 3 pieces of 30 g. Not "1 portion" / "2 tbsp" / "30 g". */
export function parseServing(s: string): { count: number; grams: number } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([^\d(]*?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:g|gr|grams?|גרם|ג)\.?\s*\)/i.exec(s);
  if (!m) return null;
  const count = Number(m[1].replace(',', '.'));
  const grams = Number(m[3].replace(',', '.'));
  const word = norm(m[2]);
  if (!(count >= 1 && grams > 0) || !word) return null;
  if (/^(g|gr|grams?|ml|portion|serving|serve|portions?|servings?|tbsp|tsp|tablespoons?|teaspoons?|cups?|slices? of|bags?|packs?|packages?|bottles?|cans?|גרם|מנה|מנות|כף|כפות|כפית|כוס|שקית|אריזה|בקבוק|פחית)$/.test(word)) return null;
  return { count, grams };
}

// Typical weight of one piece (g), for when nothing else is known. Rough
// averages from the MoH database portions of the same kind of food.
const TYPICAL_PIECE: [RegExp, number][] = [
  [/rice cake|פריכי|פריכיות/, 9],
  [/cracker|קרקר|קרקרים|crispbread|פתית/, 5],
  [/wafer|ופל|וופל/, 8],
  [/pretzel|בייגל|בייגלה/, 4],
  [/oreo|אוראו|sandwich cookie|עוגיות סנדוויץ/, 11],
  [/petit|פתי בר|biscuit|ביסקוויט/, 8],
  [/cookie|עוגי/, 12],
  [/\bdates?\b|תמר/, 8],
  [/candy|סוכרי|טופי|toffee/, 6],
  [/\bnuts?\b|אגוז|almond|שקד|cashew|קשיו|pistachio|פיסטוק|peanut|בוטן/, 1.2],
  [/chocolate|שוקולד|praline|פרלין|truffle|טראפל/, 10],
  [/chip|ביסלי|צ'יפס|crisps?/, 2],
];
export function typicalPiece(name: string): number | null {
  const n = norm(name);
  for (const [re, g] of TYPICAL_PIECE) if (re.test(n)) return g;
  return null;
}

export type PieceSource = 'yours' | 'label' | 'typical';

/** One piece's weight and where it came from. `mine` = the box you described for this product. */
export function pieceWeight(
  p: Pick<FoodProduct, 'name' | 'nameAlt' | 'pieceG'>,
  mine?: { packG: number | null; pieces: number | null } | null,
): { grams: number; source: PieceSource } | null {
  if (mine?.packG && mine.pieces) return { grams: Math.round((mine.packG / mine.pieces) * 10) / 10, source: 'yours' };
  if (p.pieceG) return { grams: p.pieceG, source: 'label' };
  const g = typicalPiece(`${p.name} ${p.nameAlt}`);
  return g ? { grams: g, source: 'typical' } : null;
}

/** The whole box's weight: yours first, then the product data. */
export function packWeight(p: Pick<FoodProduct, 'packG'>, mine?: { packG: number | null } | null): number | null {
  return mine?.packG || p.packG || null;
}

/** Grams for a count of pieces (rounded to 0.1 g). */
export function piecesToGrams(pieces: number, pieceG: number): number {
  return Math.round(pieces * pieceG * 10) / 10;
}

// ---------------------------------------------------------------- amount units (owner, Nov 2026)
//
// One number + one unit: grams, ml (liquids: drinks, Modulen…), pieces, the
// box, or the product's own household measures from the MoH data (cup,
// tablespoon, slice, small/medium/large portion…). `exact` = measured
// (grams, ml with a known density or a per-100 ml label, pieces/box from the
// label or your own box); household measures and typical pieces are
// estimates (≈).

export interface AmountUnit {
  key: string; // 'g' | 'ml' | 'piece' | 'box' | 'p<index>'
  kind: 'g' | 'ml' | 'piece' | 'box' | 'portion';
  /** Grams in one of this unit (null = not known). */
  gramsEach: number | null;
  exact: boolean;
  /** Household measure label from the data (portions only). */
  label?: string;
}

export function amountUnits(
  p: Pick<FoodProduct, 'name' | 'nameAlt' | 'pieceG' | 'packG' | 'portions' | 'liquid' | 'density' | 'source'>,
  mine?: { packG: number | null; pieces: number | null } | null,
): AmountUnit[] {
  const out: AmountUnit[] = [];
  // Water-based liquids (drinks, milk, formulas like Modulen) are within ~5% of 1 g/ml, so ml counts as measured.
  const ml: AmountUnit = { key: 'ml', kind: 'ml', gramsEach: p.density ?? 1, exact: !!p.density || p.source === 'off' || !!p.liquid };
  if (p.liquid) out.push(ml);
  out.push({ key: 'g', kind: 'g', gramsEach: 1, exact: true });
  if (!p.liquid && p.density) out.push(ml);
  const piece = pieceWeight(p, mine);
  if (piece) out.push({ key: 'piece', kind: 'piece', gramsEach: piece.grams, exact: piece.source !== 'typical' });
  const pack = packWeight(p, mine);
  if (pack) out.push({ key: 'box', kind: 'box', gramsEach: pack, exact: true });
  p.portions.forEach((x, i) => {
    // The whole package is already "box"; same weight twice would only confuse.
    const same = (g: number | null | undefined) => !!g && Math.abs(x.grams - g) < 0.5;
    if (x.grams > 0 && !same(pack) && !(piece && same(piece.grams) && PIECE_UNITS.includes(x.unit ?? -1))) out.push({ key: `p${i}`, kind: 'portion', gramsEach: x.grams, exact: false, label: x.label });
  });
  return out;
}

// A normal amount to start with (not a whole cup of oil): the data's medium /
// regular portion, a piece, a slice, a spoon for fats and spreads, else 100 g.
const START_UNITS = [802, 800, 803, 905, 903, 911, 902, 103, 100, 502, 500, 600, 603, 1226, 1224, 1209, 300, 301, 308, 400];
export function startGrams(p: Pick<FoodProduct, 'portions'>): number {
  for (const u of START_UNITS) {
    const hit = p.portions.find((x) => x.unit === u && x.grams > 0);
    if (hit) return hit.grams;
  }
  return 100;
}

/** Grams for an amount in a unit (null = the unit's weight isn't known). */
export const unitGrams = (qty: number | null, u: Pick<AmountUnit, 'gramsEach'> | null | undefined) =>
  qty != null && u?.gramsEach ? Math.round(qty * u.gramsEach * 10) / 10 : null;

/** Nutrition for a portion, including sugars, fiber, saturated fat and sodium when known. */
export function nutrientsFor(
  p: Pick<FoodProduct, 'kcal' | 'protein' | 'fat' | 'carbs'> & { sugars?: number | null; fiber?: number | null; satFat?: number | null; sodium?: number | null },
  grams: number,
) {
  const f = grams / 100;
  const r = (x: number | undefined | null) => (x == null ? null : Math.round(x * f * 10) / 10);
  return { ...forGrams(p, grams), sugars: r(p.sugars), fiber: r(p.fiber), satFat: r(p.satFat), sodium: p.sodium == null ? null : Math.round(p.sodium * f) };
}

/** Nutrition for a portion. */
export function forGrams(p: Pick<FoodProduct, 'kcal' | 'protein' | 'fat' | 'carbs'>, grams: number) {
  const f = grams / 100;
  const r = (x: number) => Math.round(x * f * 10) / 10;
  return { kcal: Math.round(p.kcal * f), protein: r(p.protein), fat: r(p.fat), carbs: r(p.carbs) };
}

/** Valid EAN-8 / UPC-A / EAN-13 / GTIN-14 check digit. */
export function validBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split('').map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export const OFF_FIELDS = 'code,product_name,product_name_he,product_name_en,brands,nutriments,serving_quantity,serving_size,product_quantity,product_quantity_unit,nutriscore_grade,categories_tags';

// ---------------------------------------------------------------- food pills + "My meals" (owner, Nov 2026)

export const FOOD_LABELS: FoodLabel[] = ['meal', 'snack', 'drink', 'healthy', 'treat', 'fast'];

/** The pill on a food's line; older items get one from what they were logged as. */
export function labelOf(f: Pick<HealthFood, 'label' | 'meal' | 'snack'>): FoodLabel {
  return f.label ?? (f.meal === 'drink' ? 'drink' : f.snack || f.meal === 'snack' ? 'snack' : 'meal');
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const sumOf = (xs: (number | null | undefined)[]) => (xs.some((x) => x != null) ? r1(xs.reduce<number>((a, x) => a + (x ?? 0), 0)) : null);

/** The whole meal: calories, protein, carbs, sugars, fat and weight added up. */
export function recipeTotals(items: RecipeItem[], portions = 1) {
  const m = (x: number | null) => (x == null ? null : r1(x * portions));
  const kcal = sumOf(items.map((i) => i.kcal));
  return {
    kcal: kcal == null ? null : Math.round(kcal * portions),
    protein: m(sumOf(items.map((i) => i.protein))),
    fat: m(sumOf(items.map((i) => i.fat))),
    carbs: m(sumOf(items.map((i) => i.carbs))),
    sugars: m(sumOf(items.map((i) => i.sugars))),
    grams: m(sumOf(items.map((i) => i.grams))),
  };
}

/** A different amount of one food in a meal: numbers follow its per-100 g values (or scale with the old amount). */
export function itemForGrams(i: RecipeItem, grams: number): RecipeItem {
  if (i.per100) {
    const f = grams / 100;
    return { ...i, grams, kcal: Math.round(i.per100.kcal * f), protein: r1(i.per100.protein * f), fat: r1(i.per100.fat * f), carbs: r1(i.per100.carbs * f), sugars: i.per100.sugars != null ? r1(i.per100.sugars * f) : null };
  }
  if (!i.grams) return { ...i, grams };
  const k = grams / i.grams;
  const sc = (x: number | null) => (x == null ? null : r1(x * k));
  return { ...i, grams, kcal: i.kcal == null ? null : Math.round(i.kcal * k), protein: sc(i.protein), fat: sc(i.fat), carbs: sc(i.carbs), sugars: sc(i.sugars) };
}

/** A logged food turned into a meal's ingredient (same amount and numbers). */
export function itemOf(f: HealthFood): RecipeItem {
  return {
    text: f.text,
    product: f.product,
    productId: f.productId,
    grams: f.grams ?? null,
    kcal: f.kcal ?? null,
    protein: f.protein ?? null,
    fat: f.fat ?? null,
    carbs: f.carbs ?? null,
    sugars: f.sugars ?? null,
    per100: f.per100 ?? null,
    source: f.source,
    drink: f.meal === 'drink',
  };
}

/** The numbers of a meal eaten as N portions (for the food's line). */
export function recipeFood(r: Pick<HealthRecipe, 'id' | 'name' | 'label' | 'items'>, portions: number): Pick<HealthFood, 'text' | 'label' | 'grams' | 'kcal' | 'protein' | 'fat' | 'carbs' | 'sugars' | 'per100' | 'source' | 'recipe'> {
  const tot = recipeTotals(r.items, portions);
  return { text: r.name, label: r.label, grams: tot.grams, kcal: tot.kcal, protein: tot.protein, fat: tot.fat, carbs: tot.carbs, sugars: tot.sugars, per100: null, source: 'recipe', recipe: { id: r.id, portions, items: r.items } };
}

// ---------------------------------------------------------------- healthy / less healthy mark (owner, Nov 2026)

/** The key your own notes on a food are kept under: its product, else its name. */
export const foodKey = (f: Pick<HealthFood, 'productId' | 'text'>) => f.productId || `name:${norm(f.text)}`;

/** A line's automatic grade: saved when added, else worked out from its values (older lines, typed-in foods with numbers). */
export function gradeOfFood(f: Pick<HealthFood, 'grade' | 'per100' | 'productId' | 'product' | 'text' | 'meal' | 'ml'>): Grade | null {
  if (f.grade !== undefined && f.grade !== null) return f.grade;
  const p = f.per100;
  if (!p || !p.kcal) return null;
  const code = f.productId?.startsWith('il:') ? Number(f.productId.slice(3)) : null;
  const facts = code ? ilFacts(code, f.product ?? f.text, '', p) : { kind: f.meal === 'drink' || f.ml != null ? ('drink' as const) : ('food' as const), fvl: 0 };
  return nutriScore(p, facts)?.grade ?? null;
}

/** Votes of all Bloom users for a food (shared library). */
export interface Votes {
  up: number;
  down: number;
}

/** The users' majority (at least 2 votes and a clear lead; a tie = no say). */
export function votedMark(v: Votes | null | undefined): 'healthy' | 'less' | null {
  if (!v || v.up + v.down < 2 || v.up === v.down) return null;
  return v.up > v.down ? 'healthy' : 'less';
}

/** How the shared counters change when your own choice changes (each person counts once). */
export function voteDelta(from: 'healthy' | 'less' | null | undefined, to: 'healthy' | 'less' | null | undefined): { up: number; down: number } {
  return { up: (to === 'healthy' ? 1 : 0) - (from === 'healthy' ? 1 : 0), down: (to === 'less' ? 1 : 0) - (from === 'less' ? 1 : 0) };
}

/**
 * Healthy / less healthy for a food line: your own choice wins, then what
 * Bloom users chose for that food (majority), then the automatic grade
 * (A/B healthy, D/E less, C none).
 */
export function healthMark(
  f: Pick<HealthFood, 'grade' | 'per100' | 'productId' | 'product' | 'text' | 'meal' | 'ml'>,
  prefs: { key: string; healthy?: 'healthy' | 'less' | null }[],
  votes?: Map<string, Votes> | null,
): { mark: 'healthy' | 'less' | null; auto: Grade | null; own: boolean; voted: 'healthy' | 'less' | null } {
  const auto = gradeOfFood(f);
  const key = foodKey(f);
  const mine = prefs.find((p) => p.key === key && p.healthy);
  const voted = votedMark(votes?.get(key));
  if (mine) return { mark: mine.healthy!, auto, own: true, voted };
  return { mark: voted ?? markOf(auto), auto, own: false, voted };
}

// ---------------------------------------------------------------- "my product": values from the package label

/** A product with your label values instead of the database's (or your own product). Label values = measured, so amounts are exact. */
export function withMine(base: FoodProduct | null, mine: HealthMyProduct): FoodProduct {
  const per = mine.per100;
  const liquid = mine.liquid ?? base?.liquid ?? false;
  const code = base?.source === 'il' ? Number(base.id.slice(3)) : null;
  const facts = code ? { ...ilFacts(code, base!.name, base!.nameAlt, per), liquid } : { kind: liquid ? ('drink' as const) : ('food' as const), fvl: 0, liquid };
  return {
    id: mine.key,
    source: base?.source ?? 'il',
    portions: [],
    ...base,
    name: mine.name || base?.name || '',
    nameAlt: base?.nameAlt ?? '',
    brand: mine.brand ?? base?.brand ?? '',
    kcal: per.kcal,
    protein: per.protein,
    fat: per.fat,
    carbs: per.carbs,
    sugars: per.sugars ?? undefined,
    fiber: per.fiber ?? undefined,
    satFat: per.satFat ?? undefined,
    sodium: per.sodium ?? undefined,
    grade: nutriScore(per, facts)?.grade ?? null,
    red: redLabels(per, facts),
    liquid,
    density: base?.density ?? (liquid ? 1 : null),
    pieceG: mine.pieceG ?? base?.pieceG ?? null,
    packG: mine.packG ?? base?.packG ?? null,
    barcode: mine.barcode ?? base?.barcode,
    mine: true,
  };
}

/** Your own products whose name matches a search (all words), newest first. */
export function searchMine(list: HealthMyProduct[], query: string): HealthMyProduct[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length || norm(query).length < 2) return [];
  return list
    .filter((m) => {
      const n = norm(`${m.name} ${m.brand ?? ''}`);
      return words.every((w) => n.includes(w));
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---------------------------------------------------------------- recent + favorites, repeat a meal (owner, Nov 2026)

/** Foods to eat again in one tap: favorites first, then the most recent, one per food (last 30 days). */
export function recentFoods(foods: HealthFood[], prefs: { key: string; fav?: boolean }[], today: string, limit = 6): HealthFood[] {
  const from = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const favs = new Set(prefs.filter((p) => p.fav).map((p) => p.key));
  const seen = new Set<string>();
  const list = foods
    .filter((f) => !f.deletedAt && !f.recipe && f.date >= from && f.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.createdAt - a.createdAt)
    .filter((f) => {
      const k = foodKey(f);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return [...list.filter((f) => favs.has(foodKey(f))), ...list.filter((f) => !favs.has(foodKey(f)))].slice(0, limit);
}

export interface PastMeal {
  date: string;
  meal: HealthFood['meal'];
  items: HealthFood[];
  kcal: number;
}

/** Earlier meals to repeat (the last 7 days before `date`), newest first; snacks and drinks of a day count as one. */
export function pastMeals(foods: HealthFood[], date: string, limit = 8): PastMeal[] {
  const from = new Date(Date.parse(date) - 7 * 86400000).toISOString().slice(0, 10);
  const groups = new Map<string, PastMeal>();
  for (const f of foods) {
    if (f.deletedAt || f.date >= date || f.date < from) continue;
    const meal: HealthFood['meal'] = f.meal === 'drink' ? 'snack' : f.meal;
    const k = `${f.date}|${meal}`;
    const g = groups.get(k) ?? { date: f.date, meal, items: [], kcal: 0 };
    g.items.push(f);
    g.kcal += f.kcal ?? 0;
    groups.set(k, g);
  }
  const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3, drink: 3 };
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || order[a.meal] - order[b.meal]).slice(0, limit);
}

/** A copy of a food line for another day (new record; same amount and time). */
export const copyFood = <T extends HealthFood>(f: T, date: string, meta: { id: string; createdAt: number; updatedAt: number }): T => ({ ...f, ...meta, date, deletedAt: null });

// ---------------------------------------------------------------- weekly food report (owner, Nov 2026)

export interface WeekReport {
  from: string;
  to: string;
  /** Finished, fully logged days in the week (same rule as the calorie balance). */
  days: number;
  avgKcal: number | null;
  avgProtein: number | null;
  /** Where the calories came from (most first), and the foods eaten most often. */
  topKcal: { name: string; kcal: number }[];
  mostEaten: { name: string; times: number }[];
  /** Share of the week's calories from healthy / less healthy / in-between foods (%). */
  healthyPct: number;
  lessPct: number;
  redFoods: number;
  /** The day closest to the calorie goal and the one farthest from it. */
  best: { date: string; kcal: number } | null;
  worst: { date: string; kcal: number } | null;
}

/** The 7 days ending `to` (today counts only once it's over). `burn`/`target` from the calorie goal when known. */
export function weekReport(
  foods: HealthFood[],
  prefs: { key: string; healthy?: 'healthy' | 'less' | null }[],
  to: string,
  today: string,
  goal: { burn: number; target: number } | null,
): WeekReport {
  const day = (d: string, k: number) => new Date(Date.parse(d) + k * 86400000).toISOString().slice(0, 10);
  const from = day(to, -6);
  const list = foods.filter((f) => !f.deletedAt && f.date >= from && f.date <= to);
  const byDay = new Map<string, number>();
  for (const f of list) byDay.set(f.date, (byDay.get(f.date) ?? 0) + (f.kcal ?? 0));
  const low = goal ? goal.burn * 0.4 : 0;
  const counted = [...byDay].filter(([d, k]) => d < today && k > 0 && k >= low);
  const countedSet = new Set(counted.map(([d]) => d));
  const inCounted = list.filter((f) => countedSet.has(f.date));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const proteinByDay = counted.map(([d]) => inCounted.filter((f) => f.date === d).reduce((a, f) => a + (f.protein ?? 0), 0));
  const groups = new Map<string, { name: string; kcal: number; times: number }>();
  let healthy = 0;
  let less = 0;
  let total = 0;
  for (const f of list) {
    const k = foodKey(f);
    const g = groups.get(k) ?? { name: f.text, kcal: 0, times: 0 };
    g.kcal += f.kcal ?? 0;
    g.times++;
    groups.set(k, g);
    const kcal = f.kcal ?? 0;
    total += kcal;
    const m = healthMark(f, prefs).mark;
    if (m === 'healthy') healthy += kcal;
    else if (m === 'less') less += kcal;
  }
  const all = [...groups.values()];
  const dist = goal ? counted.map(([d, k]) => ({ date: d, kcal: Math.round(k), off: Math.abs(k - goal.target) })).sort((a, b) => a.off - b.off) : [];
  return {
    from,
    to,
    days: counted.length,
    avgKcal: avg(counted.map(([, k]) => k)),
    avgProtein: avg(proteinByDay),
    topKcal: all
      .filter((g) => g.kcal > 0)
      .sort((a, b) => b.kcal - a.kcal)
      .slice(0, 5)
      .map(({ name, kcal }) => ({ name, kcal: Math.round(kcal) })),
    mostEaten: all
      .filter((g) => g.times > 1)
      .sort((a, b) => b.times - a.times)
      .slice(0, 5)
      .map(({ name, times }) => ({ name, times })),
    healthyPct: total ? Math.round((healthy / total) * 100) : 0,
    lessPct: total ? Math.round((less / total) * 100) : 0,
    redFoods: list.filter((f) => (f.red?.length ?? 0) > 0).length,
    best: dist.length ? { date: dist[0].date, kcal: dist[0].kcal } : null,
    worst: dist.length > 1 ? { date: dist[dist.length - 1].date, kcal: dist[dist.length - 1].kcal } : null,
  };
}

// ---------------------------------------------------------------- shared food library (all Bloom users)

/** A shared library product as "my product" values (so it is used the same way). */
export function libraryAsMine(x: { key: string; name: string; brand?: string; barcode?: string; liquid?: boolean; per100?: HealthMyProduct['per100'] | null; updatedAt: number }): HealthMyProduct | null {
  if (!x.per100) return null;
  return { id: `lib:${x.key}`, createdAt: x.updatedAt, updatedAt: x.updatedAt, deletedAt: null, ownerId: 'library', visibility: 'private', kind: 'myproduct', key: x.key, name: x.name, brand: x.brand, barcode: x.barcode, liquid: x.liquid, per100: x.per100 };
}

// ---------------------------------------------------------------- built-in Israeli products (Open Food Facts, ODbL)

/** [barcode, nameHe, nameEn, brand, kcal, protein, fat, carbs, sugars, fiber, satFat, sodiumMg, servingG, servingText, packG, liquid, grade] */
export type OffILRow = [string, string, string, string, number, number, number, number, number, number, number, number, number, string, number, number, string];
export interface FoodsOffIL {
  source: string;
  foods: OffILRow[];
}

/** A built-in Open Food Facts product (sold in Israel) as a food. */
export function offILProduct(row: OffILRow, lang: 'en' | 'he'): FoodProduct {
  const [code, he, en, brand, kcal, protein, fat, carbs, sugars, fiber, satFat, sodium, servingG, servingText, packG, liquid, grade] = row;
  const per = { kcal, protein, fat, carbs, sugars, fiber, satFat, sodium };
  const facts = { kind: liquid ? ('drink' as const) : ('food' as const), fvl: 0, liquid: !!liquid };
  const parsed = servingText ? parseServing(servingText) : null;
  return {
    id: `off:${code}`,
    source: 'off',
    name: (lang === 'he' ? he || en : en || he) || code,
    nameAlt: lang === 'he' ? en : he,
    brand,
    kcal,
    protein,
    fat,
    carbs,
    sugars,
    fiber,
    satFat,
    sodium,
    grade: (/^[a-e]$/.test(grade) ? grade : nutriScore(per, facts)?.grade) as Grade | null,
    red: redLabels(per, facts),
    liquid: !!liquid,
    density: liquid ? 1 : null,
    portions: servingG > 0 ? [{ label: servingText || `${servingG} g`, grams: servingG }] : [],
    barcode: code,
    pieceG: parsed ? Math.round((parsed.grams / parsed.count) * 10) / 10 : null,
    packG: packG || null,
  };
}

/** Offline search in the built-in products: every word in the name or brand; names starting with the query first, then shorter names. */
export function searchOffIL(db: FoodsOffIL, query: string, lang: 'en' | 'he', limit = 6): FoodProduct[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const words = q.split(' ');
  const hits: { row: OffILRow; rank: number }[] = [];
  for (const row of db.foods) {
    const name = norm(`${row[1]} ${row[2]}`);
    const all = `${name} ${norm(row[3])}`;
    if (!words.every((w) => all.includes(w))) continue;
    const starts = norm(lang === 'he' ? row[1] || row[2] : row[2] || row[1]).startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    hits.push({ row, rank: starts * 1000 + name.length });
  }
  return hits
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((h) => offILProduct(h.row, lang));
}

const byCode = new WeakMap<FoodsOffIL, Map<string, OffILRow>>();
/** A built-in product by its barcode (works offline). */
export function offILByBarcode(db: FoodsOffIL, code: string, lang: 'en' | 'he'): FoodProduct | null {
  let m = byCode.get(db);
  if (!m) {
    m = new Map(db.foods.map((r) => [r[0], r]));
    byCode.set(db, m);
  }
  const row = m.get(code);
  return row ? offILProduct(row, lang) : null;
}
