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
  /** Typical portions: label + grams. */
  portions: { label: string; grams: number }[];
  barcode?: string;
}

export interface FoodsIL {
  source: string;
  units: Record<string, [string, string]>; // code -> [he, en]
  foods: [number, string, string, number, number, number, number, [number, number][]][];
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
  const [code, he, en, kcal, protein, fat, carbs, portions] = row;
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
    portions: portions
      .filter(([u]) => db.units[u])
      .map(([u, grams]) => ({ label: db.units[u][lang === 'he' ? 0 : 1], grams })),
  };
}

/**
 * Offline search: every word must appear in the Hebrew or English name.
 * Names that start with the query come first, then shorter (simpler) names.
 */
export function searchIL(db: FoodsIL, query: string, lang: 'en' | 'he', limit = 12): FoodProduct[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const words = q.split(' ');
  // What people usually mean: cooked / ready to eat, plain. Raw, flour, oil
  // and survey ("FFQ") entries go lower unless asked for.
  const LOWER = ['uncooked', 'dry', 'dried', 'powder', 'flour', 'oil', 'ffq', 'with peel', 'לא מבושל', 'יבש', 'מיובש', 'אבקה', 'קמח', 'שמן', 'מאבקה', 'עם קליפה'].filter((w) => !q.includes(w));
  const scored: { row: FoodsIL['foods'][number]; score: number }[] = [];
  for (const row of db.foods) {
    const he = norm(row[1]);
    const en = norm(row[2]);
    if (!words.every((w) => he.includes(w) || en.includes(w))) continue;
    const name = lang === 'he' ? he : en || he;
    const tokens = name.split(' ');
    const starts = he.startsWith(q) || en.startsWith(q) ? 0 : 1;
    // Whole-word matches beat part-of-a-word ones ("egg" vs "eggplant").
    const whole = words.every((w) => tokens.includes(w) || he.split(' ').includes(w) || en.split(' ').includes(w)) ? 0 : 40;
    const extra = tokens.filter((w) => !words.includes(w)).length;
    // Word starts (Hebrew endings vary: מיובש / מיובשת); 'נא' (raw) must be exact.
    const lower = LOWER.some((w) => (w.includes(' ') ? ` ${name} `.includes(` ${w} `) : tokens.some((x) => (w === 'נא' ? x === w : x.startsWith(w))))) ? 25 : 0;
    scored.push({ row, score: starts * 100 + whole + extra * 3 + lower + name.length / 100 });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => ilProduct(db, x.row, lang));
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
