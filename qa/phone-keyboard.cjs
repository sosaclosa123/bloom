// Phone keyboard (owner: "the keyboard pops up and hides everything"): what
// is being typed in must stay visible above the keyboard. Both ways Android
// can do it: the app gets shorter (resize), or the keyboard lies over it
// (Android tells the height: "bloomKeyboard" event). Usage: qa/run.sh phone-keyboard.cjs
const { chromium } = require('playwright');
const { data: SAMPLE } = require('./sample-data.cjs');
const KB = 320;
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const lang of ['en', 'he'])
    for (const mode of ['resize', 'overlay']) {
      const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.goto('http://localhost:4173/?phone');
      await p.evaluate(([d, lang]) => {
        localStorage.clear();
        d = JSON.parse(JSON.stringify(d));
        d.settings.language = lang;
        localStorage.setItem('bloom-data-v1', JSON.stringify(d));
        localStorage.setItem('bloom-tab', 'calendar');
        localStorage.setItem('bloom-view', 'month');
      }, [SAMPLE, lang]);
      await p.reload();
      await p.waitForTimeout(1200);
      const keyboard = async (on) => {
        if (mode === 'resize') await p.setViewportSize({ width: 412, height: on ? 860 - KB : 860 });
        else await p.evaluate(([h, on]) => window.dispatchEvent(Object.assign(new Event('bloomKeyboard'), { height: on ? h : 0, open: on })), [KB, on]);
        await p.waitForTimeout(250);
      };
      // Visible = fully inside what the keyboard leaves free.
      const check = async (name) => {
        const r = await p.evaluate((kb) => {
          const el = document.activeElement;
          const b = el.getBoundingClientRect();
          const free = window.innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb')) || 0);
          return { tag: el.tagName, top: Math.round(b.top), bottom: Math.round(b.bottom), free: Math.round(free), kbOpen: document.documentElement.classList.contains('kb-open') };
        }, KB);
        const ok = r.tag !== 'BODY' && r.top >= 0 && r.bottom <= r.free + 1 && r.kbOpen;
        if (!ok) bad++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${lang} ${mode} ${name}: box ${r.top}-${r.bottom}, free to ${r.free}, kb-open ${r.kbOpen}`);
        await p.screenshot({ path: `shots/kb-${name}-${lang}-${mode}.png` });
      };
      // 1. Day panel: a new to-do.
      await p.locator('.cell[data-date="2026-11-19"]').click({ position: { x: 20, y: 30 } });
      await p.waitForTimeout(600);
      await p.locator('.phone-sheet [role="tab"]').nth(1).click();
      await p.waitForTimeout(300);
      const todo = p.locator('.phone-sheet .new-todo input');
      await todo.focus();
      await keyboard(true);
      await check('todo');
      await p.keyboard.type('Buy flowers');
      await keyboard(false);
      await p.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
      await p.evaluate(() => document.activeElement?.blur());
      await p.waitForTimeout(200);
      // 2. Notes.
      await p.locator('.phone-sheet [role="tab"]').nth(2).click();
      await p.waitForTimeout(300);
      // A new note: the "+ Note" button, then type in it.
      await p.locator('.phone-sheet .tab-actions button').click();
      await p.waitForTimeout(400);
      const note = p.locator('.phone-sheet .cards .note-rich').last();
      await note.focus();
      await keyboard(true);
      await check('note');
      await keyboard(false);
      await p.evaluate(() => document.activeElement?.blur());
      // 3. New event window: its title and the notes field lower down.
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      await p.locator('.phone-fab').click();
      await p.waitForTimeout(500);
      await p.locator('.modal .title-input').focus();
      await keyboard(true);
      await check('event-title');
      await keyboard(false);
      await ctx.close();
    }
  console.log(bad ? `phone-keyboard: ${bad} problem(s)` : 'phone-keyboard: OK');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
