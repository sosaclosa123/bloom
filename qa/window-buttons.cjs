// Desktop app: buttons on the right (English Windows) and on the LEFT (Hebrew
// Windows, faked here), app in English and Hebrew, several window sizes.
// Nothing in the top bar or side menu may sit under the buttons.
const { _electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  let bad = 0;
  for (const lang of ['en', 'he']) {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'wco-'));
    fs.writeFileSync(path.join(ud, 'bloom-data.json'), JSON.stringify({ schemaVersion: 4, deviceId: 'x', settings: { language: lang, showHebrewDate: true }, events: [], days: [], reminders: [], countdowns: [], sounds: [], journal: [], money: [] }));
    const app = await _electron.launch({ executablePath: require('path').join(__dirname, '../node_modules/electron/dist/electron'), args: [require('path').join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, BLOOM_USER_DATA: ud } });
    let p; for (let i = 0; i < 100 && !p; i++) { p = app.windows().find((w) => w.url().endsWith('index.html')); await new Promise((r) => setTimeout(r, 200)); }
    await p.waitForSelector('.header');
    for (const side of ['right', 'left'])
    for (const [w, h] of [[1366, 768], [1100, 700], [900, 640]]) {
      await app.evaluate(({ BrowserWindow }, [w, h]) => { BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('index.html')).setSize(w, h); }, [w, h]);
      await new Promise((r) => setTimeout(r, 400));
      const res = await p.evaluate((side) => {
        const BTN = 138, H = 52, vw = innerWidth;
        if (side === 'left') {
          // Pretend to be Hebrew Windows: buttons at the top-left.
          const fake = Object.assign(new EventTarget(), { visible: true, getTitlebarAreaRect: () => new DOMRect(BTN, 0, vw - BTN, H) });
          Object.defineProperty(navigator, 'windowControlsOverlay', { value: fake, configurable: true });
        }
        window.dispatchEvent(new Event('resize'));
        return new Promise((ok) => setTimeout(() => {
          const real = navigator.windowControlsOverlay.getTitlebarAreaRect();
          const zone = side === 'left' ? { l: 0, r: real.x } : { l: real.x + real.width, r: vw };
          const hits = [...document.querySelectorAll('.header button, .header .segmented, .header .clock-pill, .header h1, .rail-brand, .rail-tab')].filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width && b.top < real.height && b.bottom > 0 && b.right > zone.l + 1 && b.left < zone.r - 1;
          }).map((e) => (e.className.baseVal ?? e.className).split(' ')[0] || e.tagName);
          const off = [...document.querySelectorAll('.header button, .header .segmented')].filter((e) => { const b = e.getBoundingClientRect(); return b.left < -1 || b.right > vw + 1; }).length;
          ok({ zone: [Math.round(zone.l), Math.round(zone.r)], hits, off });
        }, 300));
      }, side);
      const ok = res.hits.length === 0 && res.off === 0;
      if (!ok) bad++;
      console.log(lang, side.padEnd(5), `${w}x${h}`, ok ? 'OK' : 'COVERED: ' + res.hits.join(',') + ' offscreen:' + res.off, '| buttons zone', res.zone.join('-'));
      if (side === 'left' && w === 1366) await p.screenshot({ path: path.join(__dirname, 'shots', `wco-left-${lang}.png`) });
    }
    await app.evaluate(({ app }) => app.quit());
  }
  console.log(bad ? `PROBLEMS: ${bad}` : 'ALL CLEAR');
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
