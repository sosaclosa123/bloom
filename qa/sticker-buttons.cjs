const { chromium } = require('playwright');
const fs = require('fs');
const { data: SAMPLE } = require('./sample-data.cjs');
(async () => {
  const b = await chromium.launch();
  let bad = 0, total = 0;
  const SIZES = process.env.QUICK ? [[1920, 1040, 1.25]] : [[1920, 1040, 1.25], [1536, 816, 1.25], [1366, 728, 1], [1280, 680, 1.5], [1093, 580, 1.25], [1000, 600, 1], [800, 560, 1]];
  for (const [w, h, dpr] of SIZES)
  for (const lang of ['en', 'he'])
  for (const size of ['medium', 'large']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(2026, 10, 19, 11, 40) });
    await p.goto('http://localhost:4173/');
    await p.evaluate(([s, lang, size]) => { localStorage.clear(); const d = JSON.parse(JSON.stringify(s)); d.settings = { ...(d.settings || {}), language: lang, fontSize: size, showHebrewDate: true }; localStorage.setItem('bloom-data-v1', JSON.stringify(d)); localStorage.setItem('bloom-tab', 'calendar'); localStorage.setItem('bloom-view', 'month'); }, [SAMPLE, lang, size]);
    await p.reload(); await p.waitForSelector('.cell'); await p.waitForTimeout(700);
    const dates = await p.evaluate(() => [...document.querySelectorAll('.cell')].filter((c) => c.querySelector('.pill, .chip-day, .headline')).map((c) => c.dataset.date));
    for (const date of dates) {
      const cell = p.locator(`.cell[data-date="${date}"]`);
      await cell.hover({ position: { x: 5, y: 5 } }); await p.waitForTimeout(60);
      for (const sel of ['.cell-sticker', '.cell-add:not(.cell-sticker)']) {
        total++;
        const ok = await cell.locator(sel).evaluate((btn) => { const r = btn.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return btn.contains(e) ? 'ok' : 'top=' + ((e.className.baseVal ?? e.className) + '').slice(0, 40) + ' op=' + getComputedStyle(btn).opacity; });
        if (ok !== 'ok' && bad < 3) console.log(ok);
        if (ok !== 'ok') { bad++; if (bad < 10) console.log('BLOCKED', w, h, dpr, lang, size, date, sel); }
      }
    }
    // real click on the busiest day opens the sticker picker
    const busy = p.locator('.cell[data-date="2026-11-19"]'); await busy.hover({ position: { x: 5, y: 5 } }); await busy.locator('.cell-sticker').click();
    if (!(await p.locator('.sticker-picker').count())) { bad++; console.log('PICKER FAIL', w, h, dpr, lang, size); }
    await ctx.close();
  }
  console.log('checked', total, 'buttons; blocked', bad);
  await b.close();
})();
