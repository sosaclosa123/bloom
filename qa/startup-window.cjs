// Desktop: launch like at PC start (--hidden), with data; the corner window
// must show the next 5 events grouped by day, on the right side, not focused.
const { _electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
(async () => {
  for (const [lang, off] of [['he', true], ['en', true], ['en', false]]) {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-'));
    const now = new Date(); const day = (n) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
    const meta = (id, vis = 'private') => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: vis });
    const ev = (id, title, d, t, color, x = {}) => ({ ...meta(id), title, allDay: false, start: `${d}T${t}`, end: `${d}T${t.slice(0, 2) === '23' ? '23:59' : pad(+t.slice(0, 2) + 1) + t.slice(2)}`, color, notes: '', location: '', repeat: 'none', remindBefore: [15], sound: 'builtin:chime', ...x });
    const data = {
      schemaVersion: 4, deviceId: 'x', settings: { language: lang, startupGlance: off },
      events: [ev('a', lang === 'he' ? 'משמרת' : 'Work shift', day(0), '23:00', 'butter'), ev('b', 'Dentist', day(1), '14:00', 'sky'), ev('c', 'Dinner with Ido', day(1), '20:00', 'rose'),
        ev('d', 'Yoga', day(2), '08:00', 'mint', { repeat: 'weekly', stickers: [{ id: 's1', kind: 'flowers', x: 0.6, y: 0.6, size: 44, rot: 0, locked: false, from: day(2) }] }),
        ev('e', 'Party', day(3), '21:00', 'lilac'), ev('f', 'Too far (6th)', day(9), '10:00', 'sky')],
      days: [{ ...meta('dd'), date: day(1), status: 'packed', headline: '', cards: [{ id: 'n1', kind: 'text', text: 'Bring the ==charger==', items: [], emoji: '' }, { id: 't1', kind: 'checklist', text: '', items: [{ id: 'i1', text: 'Milk', done: true }, { id: 'i2', text: 'Cake', done: false }], emoji: '' }], stickers: [] }],
      reminders: [], countdowns: [{ ...meta('cd'), title: 'Birthday', date: day(3), emoji: '🎂', yearly: false }], sounds: [], journal: [], money: [] };
    fs.writeFileSync(path.join(ud, 'bloom-data.json'), JSON.stringify(data));
    const app = await _electron.launch({ executablePath: require('path').join(__dirname, '../node_modules/electron/dist/electron'), args: [require('path').join(__dirname, '..'), '--no-sandbox', '--hidden', '--glance'], env: { ...process.env, BLOOM_USER_DATA: ud, LANG: lang === 'he' ? 'he_IL.UTF-8' : 'en_US.UTF-8', LANGUAGE: lang === 'he' ? 'he' : 'en' } });
    await new Promise((r) => setTimeout(r, 4000));
    const info = await app.evaluate(({ BrowserWindow, screen, app }) => {
      const g = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('glance'));
      const main = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
      const area = screen.getPrimaryDisplay().workArea;
      return { glance: g ? { visible: g.isVisible(), focused: g.isFocused(), bounds: g.getBounds() } : null, mainVisible: main?.isVisible(), area, locale: app.getPreferredSystemLanguages?.()[0] };
    });
    console.log(lang, 'setting', off ? 'ON' : 'OFF', '| main window shown:', info.mainVisible, '| locale', info.locale);
    if (!info.glance) { console.log('   no corner window (expected only when OFF)'); await app.evaluate(({ app }) => app.quit()); continue; }
    const side = info.glance.bounds.x > info.area.width / 2 ? 'right' : 'left';
    console.log('   corner window visible:', info.glance.visible, '| focused:', info.glance.focused, '| side:', side, '| bounds', JSON.stringify(info.glance.bounds));
    const g = app.windows().find((w) => w.url().includes('glance'));
    const rows = await g.evaluate(() => [...document.querySelectorAll('.glance-day')].map((d) => d.querySelector('.glance-dayname').textContent + ': ' + [...d.querySelectorAll('.glance-ev .glance-title')].map((e) => e.textContent).join(', ') + ([...d.querySelectorAll('.glance-note, .glance-cd, .glance-todo')].map((e) => ' [' + e.textContent.trim() + ']').join('')) + (d.querySelector('.glance-sticker') ? ' [sticker]' : '')));
    console.log('   ' + rows.join('\n   '));
    await g.screenshot({ path: path.join(__dirname, 'shots', `glance-${lang}.png`) });
    // closing destroys the window
    await g.locator('.glance-x').click(); await new Promise((r) => setTimeout(r, 500));
    console.log('   after ✕, windows left:', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getURL().split('/').pop()).join(', ')));
    await app.evaluate(({ app }) => app.quit());
  }
})().catch((e) => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1); });
