// Builds src/data/foods-off-il.json: products sold in Israel from Open Food
// Facts (openfoodfacts.org, open data under the Open Database License, ODbL
// 1.0: © Open Food Facts contributors). Built in, so they are found offline
// and by barcode without internet. Only products with calories are kept.
//
// Row: [barcode, nameHe, nameEn, brand, kcal, protein, fat, carbs, sugars,
//       fiber, satFat, sodiumMg, servingG, servingText, packG, liquid(1/0), grade]
// (per 100 g, or per 100 ml for drinks). Run: node scripts/fetch-foods-off-il.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIELDS = [
  'code', 'product_name', 'product_name_he', 'product_name_en', 'brands', 'nutriments', 'serving_quantity', 'serving_size',
  'product_quantity', 'product_quantity_unit', 'nutriscore_grade', 'categories_tags',
].join(',');
const URL = (page) => `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=israel&fields=${FIELDS}&page_size=100&page=${page}`;
// Pages already downloaded are kept here, so a stopped run carries on where it was.
const CACHE = join(tmpdir(), 'bloom-off-il');
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : 0;
};
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const rows = [];
const seen = new Set();
let partial = false;
pages: for (let page = 1; ; page++) {
  let data;
  const file = join(CACHE, `page-${page}.json`);
  if (existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8'));
  else {
    for (let tries = 0; ; tries++) {
      const r = await fetch(URL(page), { headers: { 'User-Agent': 'Bloom-calendar-build/1.0 (food list for the Bloom app)' } }).catch(() => null);
      if (r?.ok) {
        data = await r.json().catch(() => null);
        if (data) break;
      }
      if (tries > 30) {
        // Still refused after ~1.5 h: keep what we have (run again later to finish).
        console.log(`page ${page}: HTTP ${r?.status}, saving the pages so far`);
        partial = true;
        break pages;
      }
      await sleep(180000); // busy / throttled: wait 3 minutes
    }
    writeFileSync(file, JSON.stringify(data));
    await sleep(12000); // well under Open Food Facts' ~10 searches a minute
  }
  for (const p of data.products ?? []) {
    const code = clean(p.code);
    if (!/^\d{8,14}$/.test(code) || seen.has(code)) continue;
    const n = p.nutriments ?? {};
    let kcal = num(n['energy-kcal_100g']);
    if (!kcal && num(n['energy_100g'])) kcal = Math.round(num(n['energy_100g']) / 4.184);
    if (!kcal || kcal > 950) continue;
    const he = clean(p.product_name_he);
    const en = clean(p.product_name_en);
    const any = clean(p.product_name);
    const nameHe = he || (/[֐-׿]/.test(any) ? any : '');
    const nameEn = en || (!/[֐-׿]/.test(any) ? any : '');
    if (!nameHe && !nameEn) continue;
    const unit = clean(p.product_quantity_unit).toLowerCase();
    const pack = num(p.product_quantity);
    const cats = (p.categories_tags ?? []).join(' ');
    const liquid = unit === 'ml' || unit === 'l' || /en:beverages|en:drinks|en:milks|en:juices/.test(cats) ? 1 : 0;
    const serving = num(p.serving_quantity);
    seen.add(code);
    rows.push([
      code, nameHe, nameEn, clean(p.brands).split(',')[0].trim(),
      kcal, num(n.proteins_100g), num(n.fat_100g), num(n.carbohydrates_100g), num(n.sugars_100g), num(n.fiber_100g),
      num(n['saturated-fat_100g']), Math.round(num(n.sodium_100g) * 1000),
      serving > 0 && serving < 2000 ? serving : 0, serving > 0 ? clean(p.serving_size).slice(0, 40) : '',
      pack > 0 && pack <= 5000 && (unit === 'g' || unit === 'ml') ? pack : 0,
      liquid, /^[a-e]$/.test(p.nutriscore_grade ?? '') ? p.nutriscore_grade : '',
    ]);
  }
  console.log(`page ${page}/${data.page_count}: ${rows.length} products`);
  if (page >= (data.page_count ?? 0)) break;
}
const out = {
  source: 'Open Food Facts (openfoodfacts.org), products sold in Israel. Open Database License (ODbL 1.0), © Open Food Facts contributors.',
  fetched: new Date().toISOString().slice(0, 10),
  ...(partial ? { partial: true } : {}),
  foods: rows,
};
writeFileSync(new URL('../src/data/foods-off-il.json', import.meta.url), JSON.stringify(out));
console.log(`${rows.length} products saved`);
