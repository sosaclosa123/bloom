// The Android app (Capacitor): the browser version of Bloom running on the
// phone's own files, plus phone things: system notifications for reminders
// (scheduled ahead, so they fire while Bloom is closed), the share sheet for
// backups, opening visit documents, the back button, and "Update available"
// (a new APK from GitHub Releases; Android asks "Install?").
import { App } from '@capacitor/app';
import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { formatDuration, translate, type StringKey } from '../i18n/strings';
import { alertsDueBetween, seriesOf } from '../shared/alerts';
import { autoBackupDue, autoBackupName, backupsToDelete, type AutoBackupState } from '../shared/backup';
import type { FiredAlert, Language, Snapshot } from '../shared/types';
import type { KV, PhotoStore, PlatformAPI, UpdateState, WebOptions } from './api';

interface BloomNativePlugin {
  openFile(o: { path: string; mime: string }): Promise<void>;
  shareFile(o: { path: string; mime: string; title?: string }): Promise<void>;
  printHtml(o: { html: string; title: string }): Promise<void>;
  /** Which notification is in which series, for one notification per series with "Missed N". */
  setStacks(o: { items: Record<string, { s: string; at: number }>; missed: string }): Promise<void>;
  collapseStacks(): Promise<void>;
}
const Native = registerPlugin<BloomNativePlugin>('BloomNative');

const REPO = 'sosaclosa123/bloom';
const KV_DIR = 'kv';
const PHOTO_DIR = 'photos';
const CHANNEL = 'bloom-reminders';
const SNOOZE_KEY = 'bloom-snoozes-v1';
const SNOOZE_MIN = 10;

// ------------------------------------------------------------------ storage

/** Text values kept in memory and written to the app's own files (debounced). */
async function fileKV(): Promise<KV & { flush(): Promise<void> }> {
  const cache = new Map<string, string>();
  const fileOf = (k: string) => `${KV_DIR}/${encodeURIComponent(k)}.txt`;
  const read = async (path: string) => (await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 })).data as string;
  try {
    const { files } = await Filesystem.readdir({ path: KV_DIR, directory: Directory.Data });
    const names = new Set(files.map((f) => f.name));
    for (const n of names) {
      // A ".tmp" is only used when the app stopped between writing and renaming.
      const main = n.endsWith('.txt');
      if (!main && !(n.endsWith('.tmp') && !names.has(n.replace(/\.tmp$/, '.txt')))) continue;
      try {
        cache.set(decodeURIComponent(n.replace(/\.(txt|tmp)$/, '')), await read(`${KV_DIR}/${n}`));
      } catch {
        /* unreadable file: skip */
      }
    }
  } catch {
    /* first start: no folder yet */
  }

  const pending = new Map<string, string | null>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  const writeOne = async (k: string, v: string | null) => {
    const path = fileOf(k);
    if (v === null) {
      await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});
      return;
    }
    const tmp = path.replace(/\.txt$/, '.tmp');
    await Filesystem.writeFile({ path: tmp, data: v, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});
    await Filesystem.rename({ from: tmp, to: path, directory: Directory.Data });
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = [...pending];
    pending.clear();
    chain = chain.then(async () => {
      for (const [k, v] of batch) await writeOne(k, v).catch((e) => console.error('bloom: save failed', k, e));
    });
    return chain;
  };
  const later = () => {
    if (!timer) timer = setTimeout(() => void flush(), 150);
  };
  return {
    getItem: (k) => cache.get(k) ?? null,
    setItem: (k, v) => {
      cache.set(k, v);
      pending.set(k, v);
      later();
    },
    removeItem: (k) => {
      cache.delete(k);
      pending.set(k, null);
      later();
    },
    flush,
  };
}

/** Each photo / document is its own file (data URL text). */
const filePhotos: PhotoStore = {
  get: async (f) => {
    try {
      return (await Filesystem.readFile({ path: `${PHOTO_DIR}/${f}.txt`, directory: Directory.Data, encoding: Encoding.UTF8 })).data as string;
    } catch {
      return null;
    }
  },
  has: async (f) => {
    try {
      await Filesystem.stat({ path: `${PHOTO_DIR}/${f}.txt`, directory: Directory.Data });
      return true;
    } catch {
      return false;
    }
  },
  put: async (entries) => {
    try {
      for (const [f, d] of Object.entries(entries))
        await Filesystem.writeFile({ path: `${PHOTO_DIR}/${f}.txt`, data: d, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
      return true;
    } catch {
      return false;
    }
  },
};

/** Writes a data URL to the cache folder and returns its file:// URI. */
async function cacheFile(name: string, dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  await Filesystem.writeFile({ path: `open/${name}`, data: base64, directory: Directory.Cache, recursive: true });
  return (await Filesystem.getUri({ path: `open/${name}`, directory: Directory.Cache })).uri;
}

// ------------------------------------------------------------------ notifications

/** Notification ids are 31-bit numbers; derived from the alert key. */
function idOf(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) | 0;
  return (h & 0x7fffffff) || 1;
}

export function alertTitle(a: FiredAlert, t: (k: StringKey) => string): string {
  return a.title || (a.kind === 'med' ? t('hlMedication') : a.kind === 'water' ? t('hlNudgeWater') : a.kind === 'weigh' ? t('hlNudgeWeigh') : t('reminder'));
}

function alertBody(a: FiredAlert, lang: Language): string {
  const t = (k: StringKey, v?: Record<string, string | number>) => translate(lang, k, v);
  const time = a.when.length > 10 ? a.when.slice(11, 16) : '';
  if (a.kind !== 'event' && a.kind !== 'reminder') return time;
  return [a.minutesBefore > 0 ? t('startsIn', { t: formatDuration(lang, a.minutesBefore) }) : '', time].filter(Boolean).join(' · ');
}

/** What to schedule from now: a month of events/medicines, 2 days of water nudges (they follow what you drink). */
export function plannedAlerts(snap: Snapshot, now: number, snoozes: { alert: FiredAlert; until: number }[]): FiredAlert[] {
  const month = alertsDueBetween(snap, now, now + 31 * 86400000).filter((a) => a.kind !== 'water' || a.dueAt < now + 2 * 86400000);
  for (const sn of snoozes) if (sn.until > now) month.push({ ...sn.alert, dueAt: sn.until, key: `${sn.alert.key}~${sn.until}` });
  return month.sort((x, y) => x.dueAt - y.dueAt).slice(0, 300); // Android allows ~500 alarms per app
}

// ------------------------------------------------------------------ versions

/** true when version a (e.g. "0.2.130") is newer than b. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// ------------------------------------------------------------------ platform

export async function createAndroid(makeWeb: (o: WebOptions) => PlatformAPI): Promise<PlatformAPI> {
  const kv = await fileKV();
  const base = makeWeb({ kv, photos: filePhotos, inPageAlerts: false, maxPdfBytes: 25 * 1024 * 1024 });
  let snap = await base.load();
  const lang = () => snap.settings.language;
  const tr = (k: StringKey, v?: Record<string, string | number>) => translate(lang(), k, v);

  // Save to disk before Android may stop the app.
  const hiddenListeners = new Set<(h: boolean) => void>();
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) void kv.flush();
    hiddenListeners.forEach((l) => l(!isActive));
    if (isActive) {
      void Native.collapseStacks().catch(() => {});
      void reschedule(true);
      if (Date.now() - lastCheck > 6 * 3600000) void checkUpdate();
    }
  });

  // ---- reminders as system notifications
  let snoozes: { alert: FiredAlert; until: number }[] = [];
  try {
    snoozes = JSON.parse(kv.getItem(SNOOZE_KEY) || '[]');
  } catch {
    /* ignore */
  }
  let allowed = false;
  let lastSig = '';
  let actionLang = '';
  let running: Promise<void> = Promise.resolve();
  const reschedule = (force = false) =>
    (running = running.then(async () => {
      if (!allowed) return;
      const now = Date.now();
      snoozes = snoozes.filter((s) => s.until > now);
      const list = plannedAlerts(snap, now, snoozes);
      const sig = lang() + '|' + list.map((a) => `${a.key}@${a.dueAt}:${a.title}`).join(',');
      if (sig === lastSig && !force) return;
      lastSig = sig;
      try {
        if (actionLang !== lang()) {
          actionLang = lang();
          const snooze = { id: 'snooze', title: tr('snooze', { t: formatDuration(lang(), SNOOZE_MIN) }) };
          await LocalNotifications.registerActionTypes({
            types: [
              { id: 'event', actions: [snooze] },
              { id: 'med', actions: [{ id: 'taken', title: `✓ ${tr('hlTaken')}` }, snooze] },
              { id: 'water', actions: [{ id: 'taken', title: `+ ${tr('hlAddGlass')}` }] },
            ],
          });
        }
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
        const notifications: LocalNotificationSchema[] = list.map((a) => ({
          id: idOf(a.key),
          title: alertTitle(a, tr),
          body: alertBody(a, lang()),
          schedule: { at: new Date(a.dueAt), allowWhileIdle: true },
          channelId: CHANNEL,
          smallIcon: 'ic_stat_bloom',
          iconColor: '#7c6cd6',
          actionTypeId: a.kind === 'med' ? 'med' : a.kind === 'water' ? 'water' : 'event',
          extra: { alert: a },
        }));
        if (notifications.length) await LocalNotifications.schedule({ notifications });
        // One notification per series on screen ("Missed N"; StackReceiver.java).
        await Native.setStacks({
          items: Object.fromEntries(list.map((a) => [String(idOf(a.key)), { s: seriesOf(a), at: a.dueAt }])),
          missed: tr('alertMissed', { n: '{n}' }),
        }).catch(() => {});
      } catch (e) {
        console.error('bloom: scheduling reminders failed', e);
        lastSig = '';
      }
    }));
  let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
  base.onChange((s) => {
    snap = s;
    if (rescheduleTimer) clearTimeout(rescheduleTimer);
    rescheduleTimer = setTimeout(() => void reschedule(), 1500);
  });
  void (async () => {
    try {
      await LocalNotifications.createChannel({ id: CHANNEL, name: 'Bloom', importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#7c6cd6' });
      let p = await LocalNotifications.checkPermissions();
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LocalNotifications.requestPermissions();
      allowed = p.display === 'granted';
      void reschedule(true);
    } catch (e) {
      console.error('bloom: notifications unavailable', e);
    }
  })();

  // Taps on a notification or its buttons (also the one that opened the app).
  const openListeners = new Set<(date: string) => void>();
  const takenListeners = new Set<(a: FiredAlert) => void>();
  let pendingOpen: string | null = null;
  const pendingTaken: FiredAlert[] = [];
  void LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
    const a = (notification.extra as { alert?: FiredAlert } | undefined)?.alert;
    if (!a) return;
    if (actionId === 'snooze') {
      snoozes.push({ alert: a, until: Date.now() + SNOOZE_MIN * 60000 });
      kv.setItem(SNOOZE_KEY, JSON.stringify(snoozes));
      void reschedule(true);
    } else if (actionId === 'taken') {
      if (takenListeners.size) takenListeners.forEach((l) => l(a));
      else pendingTaken.push(a);
    } else if (a.sourceId !== 'test') {
      const date = a.when.slice(0, 10);
      if (openListeners.size) openListeners.forEach((l) => l(date));
      else pendingOpen = date;
    }
  });

  // ---- updates from GitHub Releases
  let upd: UpdateState = { status: 'idle' };
  let apkUrl = '';
  let lastCheck = 0;
  const updListeners = new Set<(s: UpdateState) => void>();
  const setUpd = (s: UpdateState) => {
    upd = s;
    updListeners.forEach((l) => l(s));
  };
  const version = App.getInfo().then((i) => i.version).catch(() => '0');
  const checkUpdate = async () => {
    if (upd.status === 'downloading') return;
    lastCheck = Date.now();
    if (upd.status !== 'ready') setUpd({ status: 'checking' });
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] };
      const v = String(j.tag_name ?? '').replace(/^v/, '');
      const apk = j.assets?.find((x) => x.name.toLowerCase().endsWith('.apk'));
      if (apk && isNewer(v, await version)) {
        apkUrl = apk.browser_download_url;
        setUpd({ status: 'ready', version: v });
      } else setUpd({ status: 'up-to-date' });
    } catch {
      setUpd({ status: 'error', message: 'offline' });
    }
  };
  setTimeout(() => void checkUpdate(), 4000);
  setInterval(() => void checkUpdate(), 6 * 3600000);

  const installUpdate = async () => {
    if (upd.status !== 'ready' || !apkUrl) return;
    const v = upd.version;
    setUpd({ status: 'downloading', version: v, percent: 0 });
    const h = await Filesystem.addListener('progress', (p) => {
      if (p.contentLength > 0) setUpd({ status: 'downloading', version: v, percent: Math.min(99, Math.round((p.bytes / p.contentLength) * 100)) });
    });
    try {
      const path = `Bloom-${v}.apk`;
      await Filesystem.downloadFile({ url: apkUrl, path, directory: Directory.Cache, progress: true });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      setUpd({ status: 'ready', version: v });
      await Native.openFile({ path: uri, mime: 'application/vnd.android.package-archive' });
    } catch (e) {
      console.error('bloom: update download failed', e);
      setUpd({ status: 'error', message: 'download' });
    } finally {
      void h.remove();
    }
  };

  // ---- weekly automatic backup (owner: on by default, can be turned off)
  // Documents/Bloom (stays if the app is removed); if Android doesn't allow
  // that, the app's own folder (Android/data/app.bloom.calendar/files/Bloom).
  const BK_LAST = 'bloom-phone-backup-last';
  const bkListeners = new Set<(s: AutoBackupState) => void>();
  const bkOn = () => snap.settings.phoneBackup !== false;
  let bkWhere: string = 'Documents/Bloom';
  let bkError: string | null = null;
  const bkState = (): AutoBackupState => ({ folder: bkOn() ? bkWhere : null, last: Number(kv.getItem(BK_LAST)) || null, error: bkError });
  const bkEmit = () => bkListeners.forEach((l) => l(bkState()));
  const writeIn = async (directory: Directory) => {
    const data = JSON.stringify(await base.load());
    await Filesystem.writeFile({ path: `Bloom/${autoBackupName(new Date())}`, data, directory, encoding: Encoding.UTF8, recursive: true });
    const { files } = await Filesystem.readdir({ path: 'Bloom', directory });
    for (const name of backupsToDelete(files.map((f) => f.name))) await Filesystem.deleteFile({ path: `Bloom/${name}`, directory }).catch(() => {});
  };
  let bkRunning = false;
  const runBackup = async (): Promise<AutoBackupState> => {
    if (bkRunning) return bkState();
    bkRunning = true;
    try {
      try {
        await writeIn(Directory.Documents);
        bkWhere = 'Documents/Bloom';
      } catch {
        // Older Android: ask for storage once, else the app's own folder.
        const p = await Filesystem.requestPermissions().catch(() => null);
        try {
          if (p?.publicStorage !== 'granted') throw new Error('no-permission');
          await writeIn(Directory.Documents);
          bkWhere = 'Documents/Bloom';
        } catch {
          await writeIn(Directory.External);
          bkWhere = 'Android/data/app.bloom.calendar/files/Bloom';
        }
      }
      kv.setItem(BK_LAST, String(Date.now()));
      bkError = null;
    } catch (e) {
      console.error('bloom: backup failed', e);
      bkError = 'write-failed';
    } finally {
      bkRunning = false;
    }
    bkEmit();
    return bkState();
  };
  const backupIfDue = () => {
    if (bkOn() && autoBackupDue(Number(kv.getItem(BK_LAST)) || null, Date.now())) void runBackup();
  };
  setTimeout(backupIfDue, 15000);
  setInterval(backupIfDue, 3 * 3600000);
  void App.addListener('appStateChange', ({ isActive }) => isActive && backupIfDue());
  const autoBackup: PlatformAPI['autoBackup'] = {
    get: async () => bkState(),
    choose: async () => {
      await base.updateSettings({ phoneBackup: true });
      return runBackup();
    },
    run: () => runBackup(),
    off: async () => {
      await base.updateSettings({ phoneBackup: false });
      bkEmit();
      return bkState();
    },
    onChange: (cb) => {
      bkListeners.add(cb);
      return () => bkListeners.delete(cb);
    },
  };

  return {
    ...base,
    kind: 'android',
    autoBackup,
    os: 'android',
    openDoc: async (p) => {
      const data = await filePhotos.get(p.fileName);
      if (!data) return;
      const mime = data.slice(5, data.indexOf(';')) || 'application/octet-stream';
      try {
        await Native.openFile({ path: await cacheFile(p.fileName, data), mime });
      } catch (e) {
        console.error('bloom: no app to open', e);
      }
    },
    exportBackup: async () => {
      const s = await base.load();
      const name = `bloom-backup-${new Date().toISOString().slice(0, 10)}.json`;
      await Filesystem.writeFile({ path: `open/${name}`, data: JSON.stringify(s, null, 1), directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
      const { uri } = await Filesystem.getUri({ path: `open/${name}`, directory: Directory.Cache });
      await Native.shareFile({ path: uri, mime: 'application/json', title: tr('exportBackup') });
      return true;
    },
    onOpenDate: (cb) => {
      openListeners.add(cb);
      if (pendingOpen) {
        cb(pendingOpen);
        pendingOpen = null;
      }
      return () => openListeners.delete(cb);
    },
    onAlertTaken: (cb) => {
      takenListeners.add(cb);
      pendingTaken.splice(0).forEach(cb);
      return () => takenListeners.delete(cb);
    },
    onHidden: (cb) => {
      hiddenListeners.add(cb);
      return () => hiddenListeners.delete(cb);
    },
    onBackButton: (cb) => {
      const h = App.addListener('backButton', () => cb());
      return () => void h.then((x) => x.remove());
    },
    exitApp: () => void App.minimizeApp(),
    printHtml: (html, title) => Native.printHtml({ html, title }),
    testPopup: async () => {
      if (!allowed) {
        const p = await LocalNotifications.requestPermissions().catch(() => null);
        allowed = p?.display === 'granted';
        if (!allowed) return;
      }
      const now = Date.now() + 3000;
      const a: FiredAlert = { key: `test@${now}`, sourceId: 'test', kind: 'reminder', title: 'Test reminder 🌸', when: new Date(now).toISOString().slice(0, 16), dueAt: now, minutesBefore: 0, sound: snap.settings.defaultSound };
      await LocalNotifications.schedule({
        notifications: [{ id: idOf(a.key), title: a.title, body: tr('reminders'), schedule: { at: new Date(now), allowWhileIdle: true }, channelId: CHANNEL, smallIcon: 'ic_stat_bloom', extra: { alert: a } }],
      });
    },
    setTitleBarTheme: (dark) => {
      void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    },
    appVersion: () => version,
    getUpdateState: async () => upd,
    onUpdateState: (cb) => {
      updListeners.add(cb);
      return () => updListeners.delete(cb);
    },
    checkForUpdates: checkUpdate,
    installUpdate,
  };
}
