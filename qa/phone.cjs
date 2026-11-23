// Phone layout check (Android app look) in a browser with ?phone.
// Usage: qa/run.sh phone.cjs   (shots in qa/shots/phone-*.png)
// ONLY=calendar,day LANGS=en THEMES=light SIZES=390x844 to narrow it down.
const { chromium } = require('playwright');
const { data: SAMPLE } = require('./sample-data.cjs');
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);
const SIZES = env('SIZES', ['360x740', '412x915']);
const LANGS = env('LANGS', ['en', 'he']);
const THEMES = env('THEMES', ['light', 'dark']);
const ONLY = env('ONLY', null);
const SCREENS = ['calendar', 'day', 'upcoming', 'countdowns', 'wallet', 'health', 'settings', 'event', 'week', 'year'];
(async () => {
  const b = await chromium.launch();
  const problems = [];
  for (const size of SIZES) for (const lang of LANGS) for (const theme of THEMES) {
    const [w, h] = size.split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      const fixed = new Date('2026-11-19T11:40:00').getTime();
      const D = Date;
      // eslint-disable-next-line no-global-assign
      Date = class extends D { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`${size} ${lang} ${theme}: page error ${e.message}`));
    await p.goto('http://localhost:4173/?phone');
    for (const s of SCREENS) {
      if (ONLY && !ONLY.includes(s)) continue;
      await p.evaluate(([d, lang, theme, s]) => {
        localStorage.clear();
        const x = JSON.parse(JSON.stringify(d));
        x.settings = { ...x.settings, language: lang, theme, healthEnabled: true };
        localStorage.setItem('bloom-data-v1', JSON.stringify(x));
        localStorage.setItem('bloom-tab', ['upcoming', 'countdowns', 'wallet', 'health'].includes(s) ? s : 'calendar');
        localStorage.setItem('bloom-view', s === 'week' || s === 'year' ? s : 'month');
      }, [SAMPLE, lang, theme, s]);
      await p.reload();
      await p.waitForTimeout(600);
      if (s === 'day') { await p.locator('.cell[data-date="2026-11-19"]').click({ position: { x: 25, y: 60 } }).catch((e) => problems.push('day click: ' + e.message)); await p.waitForTimeout(700); }
      if (s === 'settings') { await p.locator('.phone-gear').click().catch((e) => problems.push('gear: ' + e.message.split('\n')[0])); await p.waitForTimeout(400); }
      if (s === 'event') { await p.locator('.phone-fab').click().catch((e) => problems.push('fab: ' + e.message.split('\n')[0])); await p.waitForTimeout(400); }
      // Horizontal overflow = something sticks out of the phone screen.
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) problems.push(`${size} ${lang} ${theme} ${s}: page wider than screen by ${over}px`);
      await p.screenshot({ path: `shots/phone-${s}-${lang}-${theme}-${w}.png` });
    }
    await ctx.close();
  }
  await b.close();
  console.log(problems.length ? problems.join('\n') : 'phone: no problems found');
})();
