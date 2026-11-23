// Food: searching foods, portions and calories (pure logic, no network).
//  - Offline: the Israeli Ministry of Health national nutrition database
//    (src/data/foods-il.json, built by scripts/fetch-foods-il.mjs).
//  - Online (if turned on): Open Food Facts products, also by barcode.
// Values are per 100 g; a logged item stores its own grams and totals.

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
  /** Typical portions: label + grams. */
  portions: { label: string; grams: number }[];
  barcode?: string;
}

export interface FoodsIL {
  source: string;
  units: Record<string, [string, string]>; // code -> [he, en]
  /** code, Hebrew, English, kcal, protein, fat, carbs, portions, sugars, fiber (per 100 g) */
  foods: [number, string, string, number, number, number, number, [number, number][], number?, number?][];
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

export function ilProduct(db: FoodsIL, row: FoodsIL['foods'][number], lang: 'en' | 'he'): FoodProduct {
  const [code, he, en, kcal, protein, fat, carbs, portions, sugars, fiber] = row;
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
    portions: portions
      .filter(([u]) => db.units[u])
      .map(([u, grams]) => ({ label: db.units[u][lang === 'he' ? 0 : 1], grams })),
  };
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
  return {
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
    portions: Number.isFinite(serving) && serving > 0 ? [{ label: String(p.serving_size ?? '').trim() || `${serving} g`, grams: serving }] : [],
    barcode: String(p.code ?? ''),
  };
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

export const OFF_FIELDS = 'code,product_name,product_name_he,product_name_en,brands,nutriments,serving_quantity,serving_size';
