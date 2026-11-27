// Kitchen QA (Nov 2026): the idea card, Why, craving, fridge, Recipes, a
// recipe, Cook mode (timer, log to Food), Plan (fill week), Shopping, Taste;
// PC + phone, EN/HE, light/dark. Cut text + page errors; shots in shots/kt-*.png.
// Usage: qa/run.sh kitchen.cjs   (ONLY=pc or ONLY=phone to narrow)
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
// Side-scrolling Health tabs and the Health header (scrolled away on a phone) are fine.
const ok = (x) => !/hl-subtabs|pill-title|settings-tabs|OFFSCREEN button\. "(Today|Food|Kitchen|Medicines|Body|Goals|IBD|היום|אוכל|מטבח|תרופות|גוף|מטרות)|CUT-BY page span\. "(Today|היום)"|hl-private|דוח לרופא|Doctor report/.test(x);
(async () => {
  const b = await chromium.launch();
  const problems = [];
  for (const [dev, lang, theme, size, w, h] of RUNS) {
    const phone = dev === 'phone';
    const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`${dev} ${lang}: page error ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource|firebase|net::/.test(m.text()) && problems.push(`${dev} ${lang}: console ${m.text().slice(0, 160)}`));
    await p.goto('http://localhost:4173/' + (phone ? '?phone' : ''));
    await p.evaluate(([d, lang, theme, size]) => {
      const pad = (n) => String(n).padStart(2, '0');
      const n = new Date();
      const date = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
      const m = (id) => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' });
      const f = (id, time, text, kcal, protein, extra = {}) => ({ ...m(id), kind: 'food', date, time, meal: 'lunch', label: 'meal', text, tags: [], grams: 200, kcal, protein, fat: 10, carbs: 30, per100: null, source: 'il', ...extra });
      d = JSON.parse(JSON.stringify(d));
      d.health = [
        { ...m('pr'), kind: 'profile', age: 27, sex: 'female', heightCm: 165, weightKg: 62, activity: 'light', exerciseMin: 20, hot: 'no', fluidLimit: false, fluidLimitMl: null, glassMl: 250, ibdType: null, ibdLocation: '', ibdMeds: '', ostomy: null, typicalStools: null, triggerFoods: '', done: true, completed: true, qVersion: 2, goal: 'lose', pace: 'normal' },
        f('f1', '08:30', lang === 'he' ? 'יוגורט' : 'Yogurt', 150, 8, { tags: ['dairy'] }),
        f('f2', '00:10', lang === 'he' ? "צ'יפס" : 'French fries', 320, 4, { tags: ['fried'] }),
      ];
      d.settings = { ...d.settings, language: lang, healthEnabled: true, theme, fontSize: size };
      localStorage.clear();
      localStorage.setItem('bloom-data-v1', JSON.stringify(d));
      localStorage.setItem('bloom-tab', 'health');
      localStorage.setItem('bloom-health-tab', 'kitchen');
    }, [SAMPLE, lang, theme, size]);
    await p.reload();
    await p.waitForSelector('.kt-idea', { timeout: 8000 });
    await p.waitForTimeout(600);
    const tag = `${dev}-${lang}-${theme}-${size}`;
    console.log('run', tag);
    const shot = async (name) => {
      await p.waitForTimeout(350);
      const cut = (await p.evaluate(detect)).filter(ok);
      if (cut.length) problems.push(`${tag} ${name}: ${cut.slice(0, 6).join(' | ')}`);
      await p.screenshot({ path: `shots/kt-${name}-${tag}.png` });
    };
    const esc = async () => {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
    };
    const name1 = await p.locator('.kt-name').textContent();
    await shot('main');
    await p.locator('.kt-why').click();
    await shot('why');
    await esc();
    await p.locator('.kt-actions .btn-ghost').click();
    const name2 = await p.locator('.kt-name').textContent();
    if (name1 === name2) problems.push(`${tag}: "Other" did not change the idea`);
    // Craving schnitzel (fries already today) -> the baked one.
    await p.locator('.kt-links button').first().click();
    await shot('crave');
    await p.locator('.kt-win .kt-chip').first().click();
    await p.waitForTimeout(300);
    const cr = await p.locator('.kt-name').textContent();
    if (!/oven|בתנור/i.test(cr)) problems.push(`${tag}: craving schnitzel gave "${cr}"`);
    await shot('crave-result');
    await p.locator('.kt-x').click();
    // Fridge.
    await p.locator('.kt-links button').nth(1).click();
    await p.locator('.kt-fridge .kt-chip').nth(0).click();
    await p.locator('.kt-fridge .kt-chip').nth(30).click();
    await shot('fridge');
    await p.locator('.kt-fridge .modal-foot .btn-primary').click();
    await p.waitForTimeout(300);
    await shot('fridge-result');
    await p.locator('.kt-x').click();
    // Recipe view + cook mode.
    await p.locator('.kt-actions .btn-primary').click();
    await shot('view');
    await p.locator('.kt-view-foot .btn-ghost').click();
    await p.locator('.kt-plan-days .kt-chip').nth(1).click();
    await shot('view-plan');
    await p.locator('.kt-view .kt-view-foot .btn-primary').click();
    await shot('cook-ready');
    await p.locator('.kt-cook .kt-cook-nav .btn-primary').click();
    await shot('cook-step');
    const steps = await p.locator('.kt-cook-dots i').count();
    for (let i = 0; i < steps - 1; i++) {
      if (await p.locator('.kt-cook-timer .btn-primary').count()) {
        await p.locator('.kt-cook-timer .btn-primary').click();
        await p.waitForTimeout(1300);
        const left = await p.locator('.kt-cook-timer b').textContent();
        if (!/:\d\d/.test(left)) problems.push(`${tag}: timer shows "${left}"`);
        await shot('cook-timer');
        await p.locator('.kt-cook-timer .btn-ghost').first().click();
      }
      await p.locator('.kt-cook .kt-cook-nav .btn-primary').click();
      await p.waitForTimeout(120);
    }
    await shot('cook-end');
    await p.locator('.kt-cook-end .btn-primary').click();
    await p.waitForTimeout(300);
    const logged = await p.evaluate(() => JSON.parse(localStorage.getItem('bloom-data-v1')).health.filter((x) => x.kind === 'food' && x.productId?.startsWith('kitchen:')));
    if (logged.length !== 1 || !logged[0].kosher || !(logged[0].kcal > 0)) problems.push(`${tag}: log to Food failed ${JSON.stringify(logged).slice(0, 200)}`);
    await esc();
    // Recipes window.
    await p.locator('.kt-tools button').nth(0).click();
    await p.locator('.kt-recipes input').fill(lang === 'he' ? 'שקשוקה' : 'shakshuka');
    await shot('recipes');
    await p.locator('.kt-recipes input').fill('');
    await p.locator('.kt-recipes .modal-body > .btn').click();
    await p.locator('.kt-my input').first().fill(lang === 'he' ? 'הפסטה שלי' : 'My pasta');
    await p.locator('.kt-my .kt-search input').fill(lang === 'he' ? 'חזה' : 'chicken breast');
    await p.locator('.kt-my .kt-hits button').first().click();
    await p.locator('.kt-my .kt-search input').fill(lang === 'he' ? 'פרמזן' : 'parmesan');
    await p.locator('.kt-my .kt-hits button').first().click();
    await shot('my-meatdairy');
    if (!(await p.locator('.kt-my .kt-warn').count())) problems.push(`${tag}: meat+dairy warning missing`);
    await esc();
    await esc();
    // Plan.
    await p.locator('.kt-tools button').nth(1).click();
    await p.locator('.kt-plan .kt-plan-top .btn').click();
    await p.waitForTimeout(300);
    const planned = await p.locator('.kt-plan .kt-row').count();
    if (planned < 6) problems.push(`${tag}: fill week planned ${planned}`);
    await shot('plan');
    await esc();
    // Shopping.
    await p.locator('.kt-tools button').nth(2).click();
    await shot('shop');
    const before = await p.locator('.kt-shop-list li').count();
    await p.locator('.kt-tick').first().click();
    await p.waitForTimeout(200);
    if ((await p.locator('.kt-shop-list li').count()) !== before - 1) problems.push(`${tag}: bought did not remove the item`);
    await p.locator('.kt-home-toggle').click();
    await p.locator('.kt-home .btn').first().click();
    await p.waitForTimeout(200);
    await shot('shop-out');
    await esc();
    // Taste.
    await p.locator('.kt-tools button').nth(3).click();
    await shot('taste');
    await esc();
    await ctx.close();
  }
  await b.close();
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'kitchen: all good');
  process.exit(problems.length ? 1 : 0);
})();
