const { chromium } = require('playwright');
const fs = require('fs');
const { data: SAMPLE } = require('./sample-data.cjs');
const detect = () => {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.season-layer, .sticker-layer, .sr-only')) continue;
    if (el instanceof SVGElement) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('').trim();
    const isField = el.matches('input:not([type=range]):not([type=checkbox]):not([type=color]), select, textarea');
    if (!txt && !isField && !el.matches('.chip-day, .status-dot, .pill')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const name = (el.className?.baseVal ?? el.className ?? '') + '';
    const id = el.tagName.toLowerCase() + '.' + name.split(' ').filter(Boolean).slice(0, 2).join('.') + ' "' + (txt || el.value || '').trim().slice(0, 25) + '"';
    if (r.right > vw + 1 || r.left < -1) out.push('OFFSCREEN ' + id);
    // own ellipsis / own clipping
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && !['auto', 'scroll'].includes(cs.overflowX)) out.push('ELLIPSIS ' + id);
    if (el.tagName === 'SELECT' && el.scrollWidth > el.clientWidth + 1) out.push('SELECTCLIP ' + id);
    // cut by an ancestor that hides overflow
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (['auto', 'scroll'].includes(acs.overflowY) || ['auto', 'scroll'].includes(acs.overflowX)) break;
      if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      const cutY = acs.overflowY !== 'visible' && (r.bottom > ar.bottom + 1.5 || r.top < ar.top - 1.5);
      const cutX = acs.overflowX !== 'visible' && (r.right > ar.right + 1.5 || r.left < ar.left - 1.5);
      if (cutY || cutX) { out.push('CUT-BY ' + ((a.className?.baseVal ?? a.className) + '').split(' ')[0] + ' ' + id); break; }
    }
  }
  return [...new Set(out)];
};
(async () => {
  const b = await chromium.launch();
  const res = {};
  for (const [w, h, dpr] of [[1093, 580, 1.25], [1280, 680, 1.5], [1536, 816, 1.25]])
  for (const lang of ['en', 'he'])
  for (const size of ['medium', 'small', 'large']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }); const p = await ctx.newPage();
    await p.route(/\.woff2?$/, async (r) => { await new Promise((x) => setTimeout(x, 1200)); await r.continue(); });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.clock.install({ time: new Date(2026, 10, 19, 11, 40) });
    await p.goto('http://localhost:4173/');
    await p.evaluate(([s, lang, size]) => { localStorage.clear(); const d = JSON.parse(JSON.stringify(s)); d.settings = { ...(d.settings||{}), language: lang, fontSize: size, showHebrewDate: true }; localStorage.setItem('bloom-data-v1', JSON.stringify(d)); localStorage.setItem('bloom-tab', 'calendar'); localStorage.setItem('bloom-view', 'month'); }, [SAMPLE, lang, size]);
    const key = `${w} ${lang} ${size}`;
    const shot = async (name, fn) => {
      await p.reload(); await p.waitForTimeout(500);
      try { await fn(); } catch (e) { res[key + ' ' + name] = ['STEP FAILED ' + e.message.split('\n')[0]]; return; }
      await p.waitForTimeout(2200);
      res[key + ' ' + name] = await p.evaluate(detect);
      if (w === 1093) await p.screenshot({ path: `shots/dpi-${lang}-${size}-${name}.png` });
    };
    const view = (v) => p.evaluate((v) => localStorage.setItem('bloom-view', v), v);
    const tab = (t) => p.evaluate((t) => localStorage.setItem('bloom-tab', t), t);
    await shot('month', async () => { await view('month'); await tab('calendar'); await p.reload(); await p.waitForSelector('.cell'); });
    await shot('week', async () => { await view('week'); await p.reload(); await p.waitForSelector('.week'); });
    await shot('year', async () => { await view('year'); await p.reload(); await p.waitForSelector('.year-card'); });
    await shot('drawer', async () => { await view('month'); await p.reload(); await p.locator('.cell[data-date="2026-11-19"] .cell-top').first().click({ force: true }); await p.waitForSelector('.drawer, .day-drawer', { timeout: 4000 }); });
    await shot('editor', async () => { await view('month'); await p.reload(); await p.locator('.pill').first().click(); await p.waitForSelector('.modal, [role=dialog]'); await p.getByText(/More options|אפשרויות נוספות/).click().catch(() => {}); await p.getByText(/Notification sound|צליל/).first().click().catch(() => {}); });
    await shot('scheduled', async () => { await tab('upcoming'); await p.reload(); });
    await shot('countdowns', async () => { await tab('countdowns'); await p.reload(); });
    await shot('wallet', async () => { await tab('wallet'); await p.reload(); });
    await shot('settings', async () => { await tab('calendar'); await p.reload(); await p.locator('.rail button').last().click(); await p.waitForSelector('[role=dialog]'); });
    await shot('search', async () => { await tab('calendar'); await p.reload(); await p.locator('.header button[aria-label*="earch"], .header button[aria-label*="חיפוש"]').first().click(); await p.keyboard.type(lang === 'he' ? 'י' : 'yo'); });
    if (errors.length) res[key + ' errors'] = errors;
    await ctx.close();
  }
  fs.writeFileSync('fs-result-dpi.json', JSON.stringify(res, null, 1));
  // report: issues at small/large that are NOT present at medium
  for (const k of Object.keys(res)) {
    const [w, lang, size, name] = k.split(' ');
    const base = res[`${w} ${lang} medium ${name}`] || [];
    const extra = size === 'medium' ? res[k] : res[k].filter((x) => !base.includes(x));
    if (extra.length) console.log(k, size === 'medium' ? '(baseline)' : 'NEW:', extra.slice(0, 12));
  }
  await b.close();
})();
