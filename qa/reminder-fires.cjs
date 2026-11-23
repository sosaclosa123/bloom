const { _electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-'));
  const now = new Date(); const at = new Date(now.getTime() + 60000); at.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0'); const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const meta = { createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' };
  fs.writeFileSync(path.join(ud, 'bloom-data.json'), JSON.stringify({ schemaVersion: 3, deviceId: 'x', settings: { language: 'en' }, events: [], days: [], reminders: [{ ...meta, id: 'r1', title: 'Drink water', at: iso(at), repeat: 'none', note: '', sound: 'builtin:chime' }], countdowns: [], sounds: [], journal: [], money: [] }));
  const app = await _electron.launch({ executablePath: require('path').join(__dirname, '../node_modules/electron/dist/electron'), args: [require('path').join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, BLOOM_USER_DATA: ud } });
  let p; for (let i = 0; i < 100 && !p; i++) { p = app.windows().find((w) => w.url().endsWith('index.html')); await new Promise((r) => setTimeout(r, 200)); }
  await p.waitForSelector('.header');
  await p.evaluate(() => { window.__sounds = []; const AC = window.AudioContext; window.AudioContext = class extends AC { createOscillator() { window.__sounds.push(Date.now()); return super.createOscillator(); } }; });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('index.html')); global.__sent = []; const orig = w.webContents.send.bind(w.webContents); w.webContents.send = (ch, ...a) => { global.__sent.push(ch); return orig(ch, ...a); }; });
  console.log('reminder at', iso(at), 'now', iso(now));
  const deadline = at.getTime() + 15000;
  let popupShown = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    popupShown = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('popup') && w.isVisible()));
    if (popupShown) break;
  }
  await new Promise((r) => setTimeout(r, 1500));
  const sent = await app.evaluate(() => global.__sent.filter((c) => c === 'sound:play').length);
  const ctx = await p.evaluate(() => window.__sounds.length);
  console.log('popup shown:', popupShown, '| sound IPC sent:', sent, '| oscillators created:', ctx);
  const pop = app.windows().find((w) => w.url().includes('popup'));
  if (pop) await pop.screenshot({ path: path.join(__dirname, 'shots', 'popup.png') });
  await app.evaluate(({ app }) => app.quit());
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
