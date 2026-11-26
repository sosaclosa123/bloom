// Builds src/data/foods-il.json from the Israeli Ministry of Health national
// nutrition database (data.gov.il, "מאגר התזונה הלאומי הישראלי", open data):
// food names (Hebrew + English), kcal / protein / fat / carbs / sugars / fiber /
// saturated fat (g) / sodium (mg) per 100 g, and typical portion weights
// (cups, spoons, slices…). Row: [code, he, en, kcal, protein, fat, carbs,
// portions, sugars, fiber, satFat, sodiumMg]. The code's first digits are the
// food group (1 milk, 2 meat/fish, 3 eggs, 4 legumes/nuts, 5 grains, 6 fruit,
// 7 vegetables, 8 fats/oils, 9 sweets/drinks). Run: node scripts/fetch-foods-il.mjs
import { writeFileSync } from 'node:fs';

const API = 'https://data.gov.il/api/3/action/datastore_search';
const FOODS = 'c3cb0630-0650-46c1-a068-82d575c094b2';
const WEIGHTS = '755d28c0-75f7-40e1-9c8c-ecdd106f9b2d';
const UNITS = '98fb46fe-e8de-4067-94d2-b0a8ea4269da';

// English names for the database's portion units.
const EN = {
  100: 'piece', 101: 'very small piece', 102: 'small piece', 103: 'medium piece', 104: 'large piece', 105: 'very large piece', 106: 'small pouch', 107: 'medium pouch',
  200: 'cup', 201: 'measuring cup', 202: 'mug', 203: 'soup mug', 204: 'wine glass', 205: 'cup, cubed', 206: 'cup, sliced', 207: 'cup, chopped', 208: 'cup, mashed', 209: 'small wine glass',
  300: 'tablespoon', 301: 'level tablespoon', 302: 'heaped tablespoon', 304: 'ice-cream scoop', 305: 'small ladle', 307: 'large ladle', 308: 'measuring tablespoon',
  400: 'teaspoon', 401: 'level teaspoon', 402: 'heaped teaspoon', 500: 'slice', 501: 'thin slice', 502: 'medium slice', 503: 'thick slice',
  600: 'cup (yogurt)', 601: 'very small cup', 602: 'small cup', 603: 'medium cup', 604: 'large cup', 605: 'divided cup', 800: 'portion', 801: 'small portion', 802: 'medium portion', 803: 'large portion',
  900: 'package', 901: 'pack', 902: 'bar / pack', 903: 'bag', 904: 'carton', 905: 'single pack', 906: 'box', 907: 'tube', 908: 'jar', 909: 'small carton', 910: 'large carton', 911: 'small bag', 912: 'large package',
  1001: 'small plate', 1002: 'medium plate', 1003: 'large plate', 1004: 'soup plate', 1005: 'soup bowl', 1006: 'dessert bowl', 1007: 'disposable bowl',
  1100: 'bottle', 1101: 'small bottle', 1102: 'medium bottle', 1103: 'large bottle', 1104: 'can', 1105: 'small can', 1106: 'large can',
  1201: 'stalk', 1202: 'stick', 1203: 'leaf', 1204: 'ball', 1205: 'segment', 1206: 'triangle', 1207: 'cube', 1208: 'finger', 1209: 'roll', 1210: 'tablet', 1211: 'clove', 1212: 'floret', 1213: 'thick stick', 1214: 'thin stick', 1215: 'head', 1216: 'drop', 1217: 'cob', 1218: 'handful',
  1219: 'snack bar', 1220: 'mini snack', 1221: 'small snack', 1222: 'medium snack', 1223: 'large snack', 1224: 'bun', 1225: 'candy', 1226: 'pita', 1227: 'homemade pita', 1228: 'grapefruit',
  1229: 'small fillet', 1230: 'medium fillet', 1231: 'large fillet', 1232: 'small, boneless', 1233: 'medium, boneless', 1234: 'large, boneless', 1235: 'small, whole', 1236: 'medium, whole', 1237: 'large, whole',
};

async function all(resource) {
  const out = [];
  for (let offset = 0; ; offset += 5000) {
    const r = await fetch(`${API}?resource_id=${resource}&limit=5000&offset=${offset}`).then((x) => x.json());
    out.push(...r.result.records);
    if (out.length >= r.result.total || !r.result.records.length) return out;
  }
}

const [foods, weights, units] = await Promise.all([all(FOODS), all(WEIGHTS), all(UNITS)]);
const unitMap = {};
for (const u of units) if (EN[u.smlmida]) unitMap[u.smlmida] = [u.shmmida.replace(/\s+/g, ' ').trim(), EN[u.smlmida]];
const byFood = new Map();
for (const w of weights) {
  if (!unitMap[w.mida]) continue; // skips grams / kilogram
  const g = Number(w.mishkal);
  if (!(g > 0)) continue;
  const list = byFood.get(String(w.mmitzrach)) ?? [];
  if (list.length < 10) list.push([Number(w.mida), Math.round(g * 10) / 10]);
  byFood.set(String(w.mmitzrach), list);
}
const n = (x) => (x == null || x === '' ? 0 : Math.round(Number(x) * 10) / 10);
const rows = [];
for (const f of foods) {
  if (f.food_energy == null || f.food_energy === '') continue;
  rows.push([f.smlmitzrach, String(f.shmmitzrach).trim(), String(f.english_name ?? '').trim(), n(f.food_energy), n(f.protein), n(f.total_fat), n(f.carbohydrates), byFood.get(String(f.Code)) ?? [], n(f.total_sugars), n(f.total_dietary_fiber), n(f.saturated_fat), Math.round(Number(f.sodium) || 0)]);
}
const out = { source: 'Israel Ministry of Health, national nutrition database (data.gov.il)', fetched: new Date().toISOString().slice(0, 10), units: unitMap, foods: rows };
writeFileSync(new URL('../src/data/foods-il.json', import.meta.url), JSON.stringify(out));
console.log(`${rows.length} foods, ${Object.keys(unitMap).length} units`);
