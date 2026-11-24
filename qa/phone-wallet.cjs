// Phone Wallet (layout A): every tab + the "+ Purchase" window, EN/HE,
// light/dark, 360/412 wide. Fails if text is cut or something is off screen.
// Usage: qa/run.sh phone-wallet.cjs  (shots: qa/shots/phone-wl-*)
const { chromium } = require('playwright');
const { data: SAMPLE } = require('./sample-data.cjs');
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const lang of ['en', 'he'])
    for (const theme of ['light', 'dark'])
      for (const w of [360, 412]) {
        const ctx = await b.newContext({ viewport: { width: w, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
        const p = await ctx.newPage();
        p.on('pageerror', (e) => { bad++; console.log('ERR', e.message); });
        await p.goto('http://localhost:4173/?phone');
        await p.evaluate(([d, lang, theme]) => {
          localStorage.clear();
          d = JSON.parse(JSON.stringify(d));
          d.settings.language = lang;
          d.settings.theme = theme;
          // Realistic Wallet data (long names too, to catch cut text).
          const m = (id, x) => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private', ...x });
          d.money = [
            m('l1', { kind: 'limit', amount: 4000 }),
            m('s1', { kind: 'spend', title: lang === 'he' ? 'סופר' : 'Groceries', amount: 412.5, date: '2026-11-18', note: '' }),
            m('s2', { kind: 'spend', title: lang === 'he' ? 'מתנת יום הולדת לאמא ופרחים מהחנות ליד הבית' : 'Birthday present for mom and flowers from the shop near home', amount: 1250, date: '2026-11-12', note: '' }),
            m('s3', { kind: 'spend', title: lang === 'he' ? 'קפה' : 'Coffee', amount: 14, date: '2026-11-03', note: '' }),
            m('s4', { kind: 'spend', title: 'Zara', amount: 389.9, date: '2026-10-21', note: '' }),
            m('r1', { kind: 'recurring', title: 'Netflix', amount: 54.9, cycle: 'monthly', startDate: '2026-01-05', endDate: null, subscription: true, note: '' }),
            m('r2', { kind: 'recurring', title: lang === 'he' ? 'ביטוח רכב' : 'Car insurance', amount: 3200, cycle: 'yearly', startDate: '2026-03-10', endDate: null, subscription: false, note: '' }),
            m('r3', { kind: 'recurring', title: lang === 'he' ? 'דמי כרטיס אשראי' : 'Credit card fee', amount: 15, cycle: 'monthly', startDate: '2025-06-01', endDate: null, subscription: false, note: '' }),
            m('g1', { kind: 'goal', name: lang === 'he' ? 'חופשה ביוון' : 'Greece vacation', emoji: 'travel', target: 8000, targetDate: '2027-07-01' }),
            m('d1', { kind: 'deposit', goalId: 'g1', amount: 2500, date: '2026-10-01', by: '', byUid: null }),
            m('g2', { kind: 'goal', name: lang === 'he' ? 'מחשב חדש' : 'New laptop', emoji: 'gaming', target: 5000, targetDate: null }),
          ];
          localStorage.setItem('bloom-data-v1', JSON.stringify(d));
          localStorage.setItem('bloom-tab', 'wallet');
        }, [SAMPLE, lang, theme]);
        await p.reload();
        await p.waitForTimeout(900);
        const check = async (name) => {
          const issues = await p.evaluate(() => {
            const out = [];
            const vw = innerWidth;
            for (const el of document.querySelectorAll('.wallet *, .modal *')) {
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) continue;
              if (getComputedStyle(el).visibility === 'hidden') continue;
              if (r.right > vw + 1 || r.left < -1) out.push('off screen: ' + (el.className || el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
              const cs = getComputedStyle(el);
              if (el.children.length === 0 && el.textContent.trim() && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible')
                out.push('cut: ' + el.textContent.trim().slice(0, 30));
            }
            return [...new Set(out)].slice(0, 6);
          });
          if (issues.length) { bad++; console.log(lang, theme, w, name, issues); }
          await p.screenshot({ path: `shots/phone-wl-${name}-${lang}-${theme}-${w}.png` });
        };
        const tabs = p.locator('.wl-tabs .segmented button');
        for (let i = 0; i < 4; i++) {
          await tabs.nth(i).click();
          await p.waitForTimeout(250);
          await check(['month', 'year', 'savings', 'payments'][i]);
        }
        await tabs.nth(0).click();
        await p.locator('.wl-add-btn').click();
        await p.waitForTimeout(400);
        await check('add');
        await p.locator('.modal .title-input').fill('Coffee');
        await p.locator('.modal input[inputmode], .modal .money-input input').first().fill('18');
        await p.locator('.modal .btn-primary, .modal button.primary').last().click().catch(() => {});
        await p.waitForTimeout(300);
        const added = await p.locator('.wl-row-title', { hasText: 'Coffee' }).count();
        if (!added) { bad++; console.log(lang, theme, w, 'purchase not added'); }
        await ctx.close();
      }
  console.log(bad ? `phone-wallet: ${bad} problem(s)` : 'phone-wallet: OK');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
