import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  powerMonitor,
  screen,
  shell,
  Tray,
} from 'electron';
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { merge, newMeta, normalizeSnapshot, remove, updateSettings, upsert, uuid } from '../src/shared/db';
import type { CollectionName, FiredAlert, PhotoRef, RecordOf, Settings, Snapshot, SoundMeta } from '../src/shared/types';
import { gameDetectionStatus, isGaming, setOwnWindowCheck } from './gameMode';
import { Scheduler, type DeliveryReason } from './scheduler';
import { FileStore, StateFile } from './store';

const APP_ID = 'app.bloom.calendar';
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DIST = join(__dirname, '../dist');
const startHidden = process.argv.includes('--hidden');

app.setAppUserModelId(APP_ID);
if (process.env.BLOOM_USER_DATA) app.setPath('userData', process.env.BLOOM_USER_DATA);

// Journal photos are served from the photos folder via bloom-photo://p/<file>
protocol.registerSchemesAsPrivileged([
  { scheme: 'bloom-photo', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
const SAFE_NAME = /^[\w-]+\.\w+$/;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let store: FileStore;
let scheduler: Scheduler;
let mainWin: BrowserWindow | null = null;
let popupWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let popupAlerts: FiredAlert[] = [];
let popupReason: DeliveryReason = 'now';
let popupReady = false;

const windowState = new StateFile('window-state.json', {
  width: 1320,
  height: 840,
  x: undefined as number | undefined,
  y: undefined as number | undefined,
  maximized: false,
});

const isDark = () => {
  const t = store.get().settings.theme;
  return t === 'system' ? nativeTheme.shouldUseDarkColors : t === 'dark';
};

function loadPage(win: BrowserWindow, page: 'index' | 'popup') {
  if (DEV_URL) win.loadURL(`${DEV_URL}/${page === 'index' ? '' : 'popup.html'}`);
  else win.loadFile(join(DIST, `${page}.html`));
}

function titleBarColors(dark: boolean) {
  return dark ? { color: '#1d1b22', symbolColor: '#ece8f1', height: 52 } : { color: '#fbf8f6', symbolColor: '#3a3340', height: 52 };
}

// ---------------------------------------------------------------- main window

function createMainWindow() {
  const st = windowState.read();
  const dark = isDark();
  mainWin = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Bloom',
    backgroundColor: dark ? '#1d1b22' : '#fbf8f6',
    icon: join(DIST, 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColors(dark),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // reminder sounds must play while hidden in the tray
    },
  });
  if (st.maximized) mainWin.maximize();
  loadPage(mainWin, 'index');

  mainWin.once('ready-to-show', () => {
    if (!startHidden) mainWin?.show();
  });

  const saveBounds = () => {
    if (!mainWin || mainWin.isMinimized()) return;
    const maximized = mainWin.isMaximized();
    const b = maximized ? windowState.read() : { ...mainWin.getBounds() };
    windowState.write({ width: b.width, height: b.height, x: b.x, y: b.y, maximized });
  };
  mainWin.on('resize', saveBounds);
  mainWin.on('move', saveBounds);

  mainWin.on('close', (e) => {
    if (!quitting && store.get().settings.closeToTray) {
      e.preventDefault();
      mainWin?.hide();
    }
  });
  mainWin.on('closed', () => {
    mainWin = null;
  });

  // Open external links in the browser, never inside the app.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showMain(date?: string) {
  if (!mainWin) createMainWindow();
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
  if (date) mainWin.webContents.send('app:open-date', date);
}

setOwnWindowCheck((hwnd) => {
  for (const w of BrowserWindow.getAllWindows()) {
    const buf = w.getNativeWindowHandle();
    const own = buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
    if (own === hwnd) return true;
  }
  return false;
});

// ---------------------------------------------------------------- popup

const POPUP_W = 380;

function ensurePopup() {
  if (popupWin && !popupWin.isDestroyed()) return popupWin;
  popupReady = false;
  popupWin = new BrowserWindow({
    width: POPUP_W,
    height: 160,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // The key part: the popup never takes keyboard focus, so it can't pull
    // a full-screen game out of focus ("tab out").
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  popupWin.setAlwaysOnTop(true, 'screen-saver');
  popupWin.setVisibleOnAllWorkspaces(true);
  loadPage(popupWin, 'popup');
  popupWin.on('closed', () => {
    popupWin = null;
    popupReady = false;
  });
  return popupWin;
}

function positionPopup(height: number) {
  if (!popupWin) return;
  const area = screen.getPrimaryDisplay().workArea;
  const h = Math.min(Math.ceil(height), area.height - 32);
  popupWin.setBounds({ x: area.x + area.width - POPUP_W - 12, y: area.y + area.height - h - 12, width: POPUP_W, height: h });
}

function sendPopup() {
  if (!popupWin || !popupReady) return;
  if (popupAlerts.length === 0) {
    popupWin.hide();
    return;
  }
  popupWin.webContents.send('popup:alerts', popupAlerts, popupReason, store.get().settings.language, isDark());
  if (!popupWin.isVisible()) popupWin.showInactive();
}

function showAlerts(alerts: FiredAlert[], reason: DeliveryReason) {
  const keys = new Set(popupAlerts.map((a) => a.key));
  popupAlerts = [...popupAlerts, ...alerts.filter((a) => !keys.has(a.key))];
  popupReason = reason;
  ensurePopup();
  sendPopup();
}

// ---------------------------------------------------------------- tray

function trayIcon(withBadge: boolean) {
  const file = join(DIST, withBadge ? 'tray-badge.png' : 'tray.png');
  const img = nativeImage.createFromPath(file);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function buildTrayMenu() {
  if (!tray) return;
  const s = store.get().settings;
  const he = s.language === 'he';
  const missed = scheduler?.missed.length ?? 0;
  const setMode = (gameMode: Settings['gameMode']) => applySettings({ gameMode });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: he ? 'פתיחת Bloom' : 'Open Bloom', click: () => showMain() },
      ...(missed
        ? [{ label: he ? `הצגת תזכורות שפוספסו (${missed})` : `Show missed reminders (${missed})`, click: () => showMissedNow() }]
        : []),
      { type: 'separator' },
      {
        label: he ? 'מצב משחק' : 'Game Mode',
        submenu: [
          { label: he ? 'אוטומטי (זיהוי משחק)' : 'Auto (detect games)', type: 'radio', checked: s.gameMode === 'auto', click: () => setMode('auto') },
          { label: he ? 'תמיד שקט' : 'Always quiet', type: 'radio', checked: s.gameMode === 'always', click: () => setMode('always') },
          { label: he ? 'כבוי' : 'Off', type: 'radio', checked: s.gameMode === 'off', click: () => setMode('off') },
        ],
      },
      { type: 'separator' },
      {
        label: he ? 'יציאה' : 'Quit Bloom',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.setToolTip(missed ? (he ? `Bloom — ${missed} תזכורות ממתינות` : `Bloom — ${missed} reminders waiting`) : 'Bloom');
  tray.setImage(trayIcon(missed > 0));
}

function createTray() {
  tray = new Tray(trayIcon(false));
  tray.on('click', () => showMain());
  tray.on('double-click', () => showMain());
  buildTrayMenu();
}

function showMissedNow() {
  const missed = scheduler.missed;
  if (!missed.length) return;
  showAlerts(missed, 'afterGame');
  scheduler.clearMissed();
}

// ---------------------------------------------------------------- settings side-effects

function applySettings(patch: Partial<Settings>) {
  store.set(updateSettings(store.get(), patch));
}

let lastApplied: Settings | null = null;
function onSettingsChanged(s: Settings) {
  const prev = lastApplied;
  lastApplied = s;
  if (!prev || prev.startWithWindows !== s.startWithWindows) {
    if (app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')) {
      app.setLoginItemSettings({ openAtLogin: s.startWithWindows, args: ['--hidden'] });
    }
  }
  if (!prev || prev.theme !== s.theme) {
    const dark = isDark();
    try {
      mainWin?.setTitleBarOverlay(titleBarColors(dark));
    } catch {
      /* not supported on this platform */
    }
  }
  if (!prev || prev.language !== s.language || prev.gameMode !== s.gameMode) buildTrayMenu();
}

// ---------------------------------------------------------------- IPC

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
};

function registerIpc() {
  ipcMain.handle('data:load', () => store.get());
  ipcMain.handle('data:upsert', (_e, coll: CollectionName, item: RecordOf<CollectionName>) => {
    store.set(upsert(store.get(), coll, item as never));
  });
  ipcMain.handle('data:remove', (_e, coll: CollectionName, id: string) => {
    store.set(remove(store.get(), coll, id));
  });
  ipcMain.handle('data:settings', (_e, patch: Partial<Settings>) => applySettings(patch));

  ipcMain.handle('sound:import', async () => {
    const res = await dialog.showOpenDialog(mainWin!, {
      title: 'Choose a sound',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: Object.keys(AUDIO_MIME).map((e) => e.slice(1)) }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const src = res.filePaths[0];
    if (statSync(src).size > 8 * 1024 * 1024) {
      dialog.showMessageBox(mainWin!, { type: 'warning', message: 'That sound file is too big (max 8 MB).' });
      return null;
    }
    const meta: SoundMeta = { ...newMeta(), name: basename(src, extname(src)), fileName: '' };
    meta.fileName = meta.id + extname(src).toLowerCase();
    copyFileSync(src, join(store.soundsDir, meta.fileName));
    store.set(upsert(store.get(), 'sounds', meta));
    return meta;
  });

  ipcMain.handle('sound:data', (_e, id: string) => {
    const meta = store.get().sounds.find((s) => s.id === id && !s.deletedAt);
    if (!meta) return null;
    const file = join(store.soundsDir, meta.fileName);
    if (!existsSync(file)) return null;
    const mime = AUDIO_MIME[extname(file)] ?? 'audio/mpeg';
    return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  });

  ipcMain.handle('photo:add', async () => {
    const res = await dialog.showOpenDialog(mainWin!, {
      title: 'Add photos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
    });
    if (res.canceled) return [];
    const out: PhotoRef[] = [];
    for (const src of res.filePaths) {
      if (statSync(src).size > 30 * 1024 * 1024) continue;
      const id = uuid();
      const fileName = id + extname(src).toLowerCase();
      copyFileSync(src, join(store.photosDir, fileName));
      out.push({ id, fileName, name: basename(src) });
    }
    return out;
  });

  ipcMain.handle('backup:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await dialog.showSaveDialog(mainWin!, {
      title: 'Save Bloom backup',
      defaultPath: `bloom-backup-${stamp}.json`,
      filters: [{ name: 'Bloom backup', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return false;
    const snap = store.get();
    const soundFiles: Record<string, string> = {};
    for (const s of snap.sounds) {
      const f = join(store.soundsDir, s.fileName);
      if (!s.deletedAt && existsSync(f)) soundFiles[s.fileName] = readFileSync(f).toString('base64');
    }
    const photoFiles: Record<string, string> = {};
    for (const j of snap.journal) {
      if (j.deletedAt) continue;
      for (const p of j.photos) {
        const f = join(store.photosDir, p.fileName);
        if (existsSync(f)) photoFiles[p.fileName] = readFileSync(f).toString('base64');
      }
    }
    writeFileSync(res.filePath, JSON.stringify({ ...snap, soundFiles, photoFiles }), 'utf8');
    return true;
  });

  ipcMain.handle('backup:import', async () => {
    const res = await dialog.showOpenDialog(mainWin!, {
      title: 'Restore Bloom backup',
      properties: ['openFile'],
      filters: [{ name: 'Bloom backup', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths[0]) return 'cancelled';
    try {
      const raw = JSON.parse(readFileSync(res.filePaths[0], 'utf8'));
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) return 'invalid';
      const incoming = normalizeSnapshot(raw);
      const files = (raw.soundFiles ?? {}) as Record<string, string>;
      for (const [name, b64] of Object.entries(files)) {
        if (SAFE_NAME.test(name)) writeFileSync(join(store.soundsDir, name), Buffer.from(b64, 'base64'));
      }
      for (const [name, b64] of Object.entries((raw.photoFiles ?? {}) as Record<string, string>)) {
        if (SAFE_NAME.test(name)) writeFileSync(join(store.photosDir, name), Buffer.from(b64, 'base64'));
      }
      const local = store.get();
      store.set({ ...merge(local, incoming), settings: local.settings });
      return 'merged';
    } catch {
      return 'invalid';
    }
  });

  ipcMain.handle('missed:get', () => scheduler.missed);
  ipcMain.handle('missed:clear', () => scheduler.clearMissed());
  ipcMain.handle('popup:test', () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const when = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const s = store.get().settings;
    showAlerts(
      [
        {
          key: `test@${Date.now()}`,
          sourceId: 'test',
          kind: 'reminder',
          title: s.language === 'he' ? 'ככה תיראה תזכורת 🌸' : 'This is how a reminder looks 🌸',
          when,
          dueAt: Date.now(),
          minutesBefore: 0,
          sound: s.defaultSound,
        },
      ],
      'now',
    );
    mainWin?.webContents.send('sound:play', s.defaultSound, false);
  });
  ipcMain.handle('game:status', () => {
    const st = gameDetectionStatus();
    return { ...st, gamingNow: isGaming(store.get().settings.gameMode) };
  });
  ipcMain.on('window:titlebar', (_e, dark: boolean) => {
    try {
      mainWin?.setTitleBarOverlay(titleBarColors(dark));
    } catch {
      /* ignore */
    }
  });

  // Popup
  ipcMain.on('popup:ready', () => {
    popupReady = true;
    sendPopup();
  });
  ipcMain.on('popup:resize', (_e, h: number) => positionPopup(h));
  ipcMain.on('popup:dismiss', (_e, key: string) => {
    popupAlerts = popupAlerts.filter((a) => a.key !== key);
    sendPopup();
  });
  ipcMain.on('popup:dismiss-all', () => {
    popupAlerts = [];
    sendPopup();
  });
  ipcMain.on('popup:snooze', (_e, key: string, minutes: number) => {
    const a = popupAlerts.find((x) => x.key === key);
    if (a && a.sourceId !== 'test') scheduler.snooze(a, minutes);
    popupAlerts = popupAlerts.filter((x) => x.key !== key);
    sendPopup();
  });
  ipcMain.on('popup:open', (_e, date: string) => {
    popupAlerts = [];
    sendPopup();
    showMain(date);
  });
}

// ---------------------------------------------------------------- lifecycle

app.on('second-instance', () => showMain());

app.whenReady().then(() => {
  store = new FileStore();
  protocol.handle('bloom-photo', (req) => {
    const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
    const file = join(store.photosDir, name);
    if (!SAFE_NAME.test(name) || !existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  registerIpc();

  scheduler = new Scheduler({
    getData: () => store.get(),
    show: showAlerts,
    playSound: (soundId, soft) => mainWin?.webContents.send('sound:play', soundId, soft),
    onMissedChange: (missed) => {
      mainWin?.webContents.send('missed:changed', missed);
      buildTrayMenu();
    },
  });

  store.onChange((snap: Snapshot) => {
    mainWin?.webContents.send('data:changed', snap);
    onSettingsChanged(snap.settings);
  });

  createMainWindow();
  createTray();
  onSettingsChanged(store.get().settings);
  ensurePopup(); // pre-load so the first reminder appears instantly
  scheduler.start();

  powerMonitor.on('resume', () => scheduler.tick());
  nativeTheme.on('updated', () => {
    try {
      mainWin?.setTitleBarOverlay(titleBarColors(isDark()));
    } catch {
      /* ignore */
    }
  });
  powerMonitor.on('unlock-screen', () => scheduler.tick());
});

app.on('before-quit', () => {
  quitting = true;
  scheduler?.stop();
  store?.flush();
});

app.on('window-all-closed', () => {
  // Keep running in the tray so reminders still fire.
  if (!store?.get().settings.closeToTray) app.quit();
});
