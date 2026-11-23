// Bloom hidden in the tray (as at PC start), a game "running" (game mode =
// always quiet), a reminder fires: the soft sound must actually play, the
// popup must NOT appear, and the reminder waits for after the game.
const { _electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-'));
  const now = new Date(); const at = new Date(now.getTime() + 60000); at.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0'); const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const meta = { createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' };
  fs.writeFileSync(path.join(ud, 'bloom-data.json'), JSON.stringify({ schemaVersion: 4, deviceId: 'x', settings: { language: 'en', gameMode: 'always', gameModeSoftSound: true, startupGlance: false }, events: [{ ...meta, id: 'e', title: 'Drink water', allDay: false, start: iso(at), end: iso(at), color: 'mint', notes: '', location: '', repeat: 'none', remindBefore: [0], sound: 'builtin:chime' }], days: [], reminders: [], countdowns: [], sounds: [], journal: [], money: [] }));
  const app = await _electron.launch({ executablePath: require('path').join(__dirname, '../node_modules/electron/dist/electron'), args: [require('path').join(__dirname, '..'), '--no-sandbox', '--hidden'], env: { ...process.env, BLOOM_USER_DATA: ud } });
  let p; for (let i = 0; i < 100 && !p; i++) { p = app.windows().find((w) => w.url().endsWith('index.html')); await new Promise((r) => setTimeout(r, 200)); }
  await p.waitForSelector('.header');
  // Record what audio the page really plays.
  await p.evaluate(() => {
    window.__played = [];
    const AC = window.AudioContext;
    window.AudioContext = class extends AC {
      createOscillator() { const o = super.createOscillator(); const ctx = this; window.__played.push({ t: Date.now(), state: () => ctx.state }); return o; }
      createGain() { const g = super.createGain(); const set = g.gain.linearRampToValueAtTime.bind(g.gain); g.gain.linearRampToValueAtTime = (v, t) => { window.__peak = Math.max(window.__peak || 0, v); return set(v, t); }; return g; }
    };
  });
  console.log('main window visible:', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html')).isVisible()));
  const deadline = at.getTime() + 12000;
  while (Date.now() < deadline) { await new Promise((r) => setTimeout(r, 1000)); if (await p.evaluate(() => window.__played.length)) break; }
  await new Promise((r) => setTimeout(r, 800));
  const res = await p.evaluate(() => ({ tones: window.__played.length, ctxState: window.__played[0]?.state(), peak: window.__peak }));
  const popup = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('popup') && w.isVisible()));
  console.log('soft sound tones:', res.tones, '| audio running:', res.ctxState, '| loudest gain:', res.peak?.toFixed(3), '| popup shown in game:', popup);
  await app.evaluate(({ app }) => app.quit());
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
