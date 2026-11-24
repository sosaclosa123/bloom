// Phone smoothness: frame times while the day panel opens/closes and a window
// opens, with the CPU slowed down 4x (like a mid-range phone).
// Usage: qa/run.sh phone-fps.cjs
const { chromium } = require('playwright');
const { data: SAMPLE } = require('./sample-data.cjs');
const RATE = Number(process.env.CPU || 4);
(async () => {
  const b = await chromium.launch({ args: ['--enable-gpu-rasterization'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/?phone');
  await p.evaluate((d) => {
    localStorage.clear();
    d = JSON.parse(JSON.stringify(d));
    d.settings.language = 'en';
    localStorage.setItem('bloom-data-v1', JSON.stringify(d));
    localStorage.setItem('bloom-tab', 'calendar');
    localStorage.setItem('bloom-view', 'month');
  }, SAMPLE);
  await p.reload();
  await p.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const measure = async (label, action, ms = 700) => {
    await p.evaluate(() => {
      window.__f = [];
      let last = performance.now();
      const tick = (t) => {
        window.__f.push(t - last);
        last = t;
        if (window.__on) requestAnimationFrame(tick);
      };
      window.__on = true;
      requestAnimationFrame(tick);
    });
    await action();
    await p.waitForTimeout(ms);
    const f = await p.evaluate(() => {
      window.__on = false;
      return window.__f.slice(1);
    });
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const worst = Math.max(...f);
    const slow = f.filter((x) => x > 25).length;
    console.log(`${label.padEnd(22)} fps ${(1000 / avg).toFixed(0).padStart(3)}  worst frame ${worst.toFixed(0).padStart(4)} ms  slow frames ${slow}/${f.length}`);
    return { avg, worst, slow };
  };
  const res = [];
  for (let i = 0; i < 2; i++) {
    res.push(await measure('open day', () => p.locator('.cell[data-date="2026-11-19"]').click({ position: { x: 20, y: 60 } })));
    res.push(await measure('switch day', () => p.locator('.cell[data-date="2026-11-27"]').click({ position: { x: 10, y: 10 } })));
    res.push(await measure('close day (X)', () => p.locator('.phone-sheet .drawer-head .icon-btn').click()));
    res.push(await measure('idle (particles)', async () => {}, 1000));
    res.push(await measure('open new event', () => p.locator('.phone-fab').click()));
    res.push(await measure('close window', () => p.keyboard.press('Escape')));
    res.push(await measure('swipe month', () => p.locator('.phone-header .icon-btn').nth(1).click()));
  }
  await b.close();
})();
