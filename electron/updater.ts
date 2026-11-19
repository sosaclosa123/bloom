// Auto-update from GitHub Releases (sosaclosa123/bloom).
// Checks on startup and every few hours, downloads quietly in the background,
// then tells the UI "update ready". Installing happens on restart (or on the
// next quit if she ignores it), and her data is kept.
import { app, type BrowserWindow } from 'electron';

export type UpdateState =
  | { status: 'idle' | 'checking' | 'up-to-date' | 'unsupported' }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

const CHECK_EVERY_MS = 4 * 3600 * 1000;

let state: UpdateState = { status: 'idle' };
let getWindow: () => BrowserWindow | null = () => null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let updater: any = null;

function set(next: UpdateState) {
  state = next;
  getWindow()?.webContents.send('update:state', state);
}

export function updateState() {
  return state;
}

export function initUpdater(win: () => BrowserWindow | null) {
  getWindow = win;
  if (!app.isPackaged) {
    set({ status: 'unsupported' });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    updater = require('electron-updater').autoUpdater;
  } catch (err) {
    set({ status: 'error', message: String(err) });
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => state.status !== 'ready' && set({ status: 'checking' }));
  updater.on('update-not-available', () => state.status !== 'ready' && set({ status: 'up-to-date' }));
  updater.on('download-progress', (p: { percent: number }) =>
    set({ status: 'downloading', version: (state as { version?: string }).version ?? '', percent: Math.round(p.percent) }),
  );
  updater.on('update-available', (info: { version: string }) => set({ status: 'downloading', version: info.version, percent: 0 }));
  updater.on('update-downloaded', (info: { version: string }) => set({ status: 'ready', version: info.version }));
  updater.on('error', (err: Error) => state.status !== 'ready' && set({ status: 'error', message: err?.message ?? String(err) }));

  setTimeout(checkNow, 15_000); // let the app settle after startup first
  setInterval(checkNow, CHECK_EVERY_MS);
}

export function checkNow() {
  if (!updater || state.status === 'ready' || state.status === 'downloading') return;
  updater.checkForUpdates().catch((err: Error) => set({ status: 'error', message: err?.message ?? String(err) }));
}

/** Quit, install the downloaded update silently, and reopen Bloom. */
export function installNow(beforeQuit: () => void) {
  if (!updater || state.status !== 'ready') return;
  beforeQuit();
  updater.quitAndInstall(true, true);
}
