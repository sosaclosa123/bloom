// Health redesign QA (Nov 2026): Today, Food, Body, food pills, Add food,
// My meals (create + eat), on PC and phone, EN/HE, light/dark. Reports cut
// text (clip-check detector) and page errors; shots in shots/hr-*.png.
// Usage: qa/run.sh health-redesign.cjs    (ONLY=pc or ONLY=phone to narrow)
const { chromium } = require('playwright');
const fs = require('fs');
const { data: SAMPLE } = require('./sample-data.cjs');
const src = fs.readFileSync(__dirname + '/clip-check.cjs', 'utf8');
const detect = eval('(' + src.slice(src.indexOf('const detect = () => {') + 'const detect = '.length, src.indexOf('(async () => {')).trim().replace(/;$/, '') + ')');
const RUNS = [
  ['pc', 'en', 'light', 'medium', 1280, 760],
  ['pc', 'he', 'dark', 'large', 1093, 640],
  ['phone', 'en', 'dark', 'medium', 360, 740],
  ['phone', 'he', 'light', 'large', 320, 680],
].filter((r) => !process.env.ONLY || r[0] === process.env.ONLY);
// Side-scrolling rows (tabs) are allowed to go off screen.
const ok = (x) => !/hl-subtabs|OFFSCREEN button\. "(Today|Body|Medicines|Goals|IBD|Trends|היום|גוף|תרופות|מטרות|IBD)|pill-title|settings-tabs/.test(x);
(async () => {
  const b = await chromium.launch();
  const problems = [];
  for (const [dev, lang, theme, size, w, h] of RUNS) {
    const phone = dev === 'phone';
    const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`${dev} ${lang}: page error ${e.message}`));
    await p.goto('http://localhost:4173/' + (phone ? '?phone' : ''));
    await p.evaluate(([d, lang, theme, size]) => {
      const pad = (n) => String(n).padStart(2, '0');
      const n = new Date();
      const date = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
      const m = (id) => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' });
      const it = (text, grams, k, pr, per) => ({ text, grams, kcal: k, protein: pr, fat: 3, carbs: 20, sugars: 1, per100: per ? { kcal: (k / grams) * 100, protein: (pr / grams) * 100, fat: 2, carbs: 10, sugars: 0.5 } : null, source: 'il' });
      const bowl = { ...m('r1'), kind: 'recipe', name: lang === 'he' ? 'קערת אורז' : 'Rice bowl', label: 'healthy', items: [it(lang === 'he' ? 'אורז' : 'Rice', 100, 130, 2.7, true), it(lang === 'he' ? 'חזה עוף' : 'Chicken breast', 150, 248, 46.5, true)] };
      const f = (id, label, meal, text, grams, kcal, protein, extra = {}) => ({ ...m(id), kind: 'food', date, time: '09:00', meal, label, text, tags: [], grams, kcal, protein, fat: 3, carbs: 10, per100: null, source: 'il', ...extra });
      d = JSON.parse(JSON.stringify(d));
      d.health = [
        { ...m('pr'), kind: 'profile', age: 27, sex: 'female', heightCm: 165, weightKg: 62, activity: 'light', exerciseMin: 20, hot: 'no', fluidLimit: false, fluidLimitMl: null, glassMl: 250, ibdType: null, ibdLocation: '', ibdMeds: '', ostomy: null, typicalStools: null, triggerFoods: '', done: true, completed: true, qVersion: 2, goal: 'lose', pace: 'normal' },
        bowl,
        f('f1', 'meal', 'breakfast', lang === 'he' ? 'יוגורט חלבון' : 'Protein yogurt', 200, 140, 20),
        { ...f('f2', 'healthy', 'lunch', bowl.name, 250, 378, 49.2), source: 'recipe', recipe: { id: 'r1', portions: 1, items: bowl.items } },
        f('f3', 'snack', 'snack', lang === 'he' ? 'במבה' : 'Bamba', 25, 134, 3.8, { snack: true }),
        f('f4', 'drink', 'drink', lang === 'he' ? 'שוקו' : 'Chocolate milk', 250, 190, 8.2),
        f('f5', 'fast', 'dinner', lang === 'he' ? 'פיצה' : 'Pizza slice', 120, 300, 12),
        { ...m('md'), kind: 'med', name: 'Vitamin D', dose: '', times: ['08:00', '20:00'], remind: false, active: true, supplement: true, every: 1, unit: 'day', startDate: date, sticker: 'pill' },
        { ...m('bd'), kind: 'body', date, weightKg: 62, exerciseMin: 30, steps: 4200 },
        { ...m('ts'), kind: 'test', date, name: 'Vitamin B12', value: 410, unit: 'pg/mL', ibd: false, note: '' },
      ];
      d.settings = { ...d.settings, language: lang, healthEnabled: true, theme, fontSize: size };
      localStorage.clear();
      localStorage.setItem('bloom-data-v1', JSON.stringify(d));
      localStorage.setItem('bloom-tab', 'health');
      localStorage.setItem('bloom-health-tab', 'today');
    }, [SAMPLE, lang, theme, size]);
    await p.reload();
    await p.waitForTimeout(900);
    const tag = `${dev}-${lang}-${theme}-${size}`;
    console.log('run', tag);
    const shot = async (name) => {
      await p.waitForTimeout(350);
      const cut = (await p.evaluate(detect)).filter(ok);
      if (cut.length) problems.push(`${tag} ${name}: ${cut.slice(0, 6).join(' | ')}`);
      await p.screenshot({ path: `shots/hr-${name}-${tag}.png` });
    };
    const tab = async (i) => {
      await p.locator('.hl-subtabs [role="tab"]').nth(i).click();
      await p.waitForTimeout(500);
    };
    const esc = async () => {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
    };
    await shot('today');
    await p.locator('.hl-today-food .hl-pill').first().click();
    await shot('pillpop');
    await esc();
    await p.locator('.hl-today-food .link-btn').click();
    await shot('addfood');
    await esc();
    await p.locator('.hl-today-food .hl-ft-click').nth(1).click();
    await shot('mealedit');
    await esc();
    await tab(1);
    await shot('food');
    await p.locator('.hl-meals-card .link-btn').click();
    await p.waitForTimeout(300);
    await p.locator('.hl-recipe input').first().fill(lang === 'he' ? 'טוסט וביצה' : 'Toast & egg');
    await p.locator('.hl-recipe .hl-food-search input').fill(lang === 'he' ? 'ביצה' : 'egg');
    await p.waitForTimeout(800);
    await p.locator('.hl-recipe .hl-food-results button').first().click().catch(() => problems.push(`${tag}: no search result for egg`));
    await p.locator('.hl-recipe .hl-food-actions .btn-primary').click().catch(() => {});
    await p.waitForTimeout(300);
    await shot('createmeal');
    await p.locator('.hl-recipe .modal-foot .btn-primary').click().catch(() => {});
    await p.waitForTimeout(300);
    const meals = await p.locator('.hl-meals-list li').count();
    if (meals !== 2) problems.push(`${tag}: expected 2 saved meals after creating one, found ${meals}`);
    const before = await p.locator('.hl-food .hl-ft-row:not(.hl-ft-head)').count();
    await p.locator('.hl-meals-list li .btn-primary').first().click();
    await p.waitForTimeout(300);
    const after = await p.locator('.hl-food .hl-ft-row:not(.hl-ft-head)').count();
    if (after !== before + 1) problems.push(`${tag}: "Eat" should add one line (${before} -> ${after})`);
    await shot('food-after');
    await tab(3);
    await shot('body');
    await ctx.close();
  }
  await b.close();
  console.log(problems.length ? problems.join('\n') : 'health-redesign: no problems found');
})();
