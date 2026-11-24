// Phone: opens menus, pop-ups and windows on every page and checks that each
// one is fully on screen and not covered/cut by anything (EN + HE, phone sizes).
// Usage: qa/run.sh phone-menus.cjs   SIZES=320x640,360x740 LANGS=he to narrow.
const { chromium } = require('playwright');
const { data: SAMPLE } = require('./sample-data.cjs');
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);
const SIZES = env('SIZES', ['320x640', '360x740', '412x915']);
const LANGS = env('LANGS', ['en', 'he']);
const OVERLAYS = '[role="dialog"], .hl-pop, .sticker-picker, .color-menu, .note-pop, .scope-ask, .modal, .toast, .update-banner';

async function check(p, label, problems) {
  const found = await p.evaluate((sel) => {
    const out = [];
    const vw = innerWidth, vh = innerHeight;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || getComputedStyle(el).visibility === 'hidden') continue;
      const name = el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName;
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) out.push(`${name} off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}) screen ${vw}x${vh}`);
      // Sample points: each must show the overlay itself (not something on top / clipped away).
      const pts = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
      for (const [fx, fy] of pts) {
        const x = Math.min(vw - 1, Math.max(0, r.left + r.width * fx)), y = Math.min(vh - 1, Math.max(0, r.top + r.height * fy));
        const hit = document.elementFromPoint(x, y);
        if (hit && !el.contains(hit) && !hit.contains(el)) {
          out.push(`${name} covered/cut at ${fx},${fy} by ${hit.className && typeof hit.className === 'string' ? hit.className.split(' ')[0] : hit.tagName}`);
          break;
        }
      }
    }
    return out;
  }, OVERLAYS);
  for (const f of found) problems.add(`${label}: ${f}`);
}

(async () => {
  const b = await chromium.launch();
  const problems = new Set();
  let opened = 0;
  for (const size of SIZES) for (const lang of LANGS) {
    const [w, h] = size.split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.add(`${size} ${lang}: page error ${e.message}`));
    await p.goto('http://localhost:4173/?phone');
    const reset = async (tab, view = 'month') => {
      await p.evaluate(([d, lang, tab, view]) => {
        localStorage.clear();
        const x = JSON.parse(JSON.stringify(d));
        x.settings = { ...x.settings, language: lang, theme: 'light', healthEnabled: true, healthIbd: true, healthGoals: true, healthChallenges: true };
        localStorage.setItem('bloom-data-v1', JSON.stringify(x));
        localStorage.setItem('bloom-tab', tab);
        localStorage.setItem('bloom-view', view);
      }, [SAMPLE, lang, tab, view]);
      await p.reload();
      await p.waitForTimeout(500);
    };
    const L = (s) => `${size} ${lang} ${s}`;
    const tryOpen = async (label, locator, after = 450) => {
      const n = await locator.count();
      if (!n) return problems.add(`${L(label)}: nothing to open (selector found nothing)`);
      await locator.first().scrollIntoViewIfNeeded().catch(() => {});
      await locator.first().click({ timeout: 4000 }).catch((e) => problems.add(`${L(label)}: can't tap (${e.message.split('\n')[0]})`));
      await p.waitForTimeout(after);
      opened++;
      await check(p, L(label), problems);
    };

    // Calendar: day panel + sticker picker; event editor (+ its folded parts); search; settings tabs.
    await reset('calendar');
    await tryOpen('day panel', p.locator('.cell[data-date="2026-11-19"]'), 700);
    await tryOpen('sticker picker', p.locator('.phone-sheet-sticker'));
    await reset('calendar');
    await tryOpen('new event', p.locator('.phone-fab'));
    for (const t of await p.locator('.modal button:has-text("Notification sound"), .modal button:has-text("More options"), .modal button:has-text("צליל"), .modal button:has-text("אפשרויות")').all()) {
      await t.click().catch(() => {});
      await p.waitForTimeout(300);
      await check(p, L('new event (opened parts)'), problems);
    }
    await reset('calendar');
    await tryOpen('search', p.locator('.phone-header .icon-btn[aria-label="Search"], .phone-header .icon-btn[aria-label="חיפוש"]'));
    await reset('calendar');
    await tryOpen('settings', p.locator('.phone-gear'));
    for (const t of await p.locator('.settings-tabs button').all()) {
      await t.click().catch(() => {});
      await p.waitForTimeout(250);
      await check(p, L('settings tab'), problems);
    }
    await reset('calendar', 'year');
    await tryOpen('month color menu', p.locator('.year-card .color-dot'));
    await reset('calendar', 'week');
    await check(p, L('week'), problems);

    // Scheduled / Countdowns / Wallet.
    await reset('upcoming');
    await tryOpen('event from Scheduled', p.locator('button.up-row'));
    await reset('countdowns');
    await tryOpen('countdown editor', p.locator('.cd-add, .cd-card').last());
    await reset('wallet');
    for (let i = 0; ; i++) {
      const btns = p.locator('.content button:visible');
      if (i >= Math.min(await btns.count(), 14)) break;
      await reset('wallet');
      const bt = p.locator('.content button:visible').nth(i);
      const txt = ((await bt.textContent().catch(() => '')) || '').trim().slice(0, 20);
      await bt.click({ timeout: 2000 }).catch(() => {});
      await p.waitForTimeout(350);
      await check(p, L(`wallet button "${txt}"`), problems);
    }

    // Health: every Today tile pop-up, every Quick add editor, every tab.
    await reset('health');
    // close the health questions if they open by themselves
    const tiles = await p.locator('.hl-tile:not(.water)').count();
    for (let i = 0; i < tiles; i++) {
      await reset('health');
      await tryOpen(`health tile ${i}`, p.locator('.hl-tile:not(.water)').nth(i));
    }
    await reset('health');
    const quick = await p.locator('.hl-quick-btn').count();
    for (let i = 0; i < quick; i++) {
      await reset('health');
      await tryOpen(`health quick add ${i}`, p.locator('.hl-quick-btn').nth(i));
    }
    await reset('health');
    const htabs = await p.locator('.hl-subtabs [role="tab"], .hl-subtabs button').count();
    for (let i = 0; i < htabs; i++) {
      await p.locator('.hl-subtabs [role="tab"], .hl-subtabs button').nth(i).click().catch(() => {});
      await p.waitForTimeout(400);
      await check(p, L(`health tab ${i}`), problems);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) problems.add(L(`health tab ${i}: page wider than screen by ${over}px`));
    }
    await ctx.close();
  }
  await b.close();
  console.log(`phone-menus: opened ${opened} things`);
  console.log(problems.size ? [...problems].join('\n') : 'phone-menus: no problems found');
})();
