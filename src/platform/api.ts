// PlatformAPI: everything the UI needs from the device it runs on.
//  - desktop (Windows): Electron bridge, JSON file, tray, game-aware popups
//  - web (dev / QA in a browser): localStorage + in-page reminders
//  - android (Capacitor): the web version on phone storage + native
//    notifications, share sheet, APK updates (see android.ts)
import { Capacitor } from '@capacitor/core';
import { alertsDueBetween } from '../shared/alerts';
import { COLLECTIONS, emptySnapshot, merge, newMeta, normalizeSnapshot, remove, updateSettings, upsert } from '../shared/db';
import type { CollectionName, Collections, FiredAlert, PhotoRef, RecordOf, Settings, Snapshot, SoundMeta } from '../shared/types';
import { uuid } from '../shared/db';
import type { DesktopBridge, UpdateState } from './bridge';
export type { UpdateState };

export interface PlatformAPI {
  kind: 'desktop' | 'web' | 'android';
  os: string;
  load(): Promise<Snapshot>;
  upsert<C extends CollectionName>(coll: C, item: RecordOf<C>): Promise<void>;
  remove(coll: CollectionName, id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  onChange(cb: (s: Snapshot) => void): () => void;
  importSound(): Promise<SoundMeta | null>;
  soundData(id: string): Promise<string | null>;
  /** Lets the user pick photos; they're copied into the app's own storage. */
  addPhotos(): Promise<PhotoRef[]>;
  /** A URL an <img> can show. */
  photoUrl(p: PhotoRef): Promise<string>;
  /** Sync helpers: photo files as data URLs, and merging records from the cloud. */
  readPhoto(fileName: string): Promise<string | null>;
  hasPhoto(fileName: string): Promise<boolean>;
  writePhoto(fileName: string, dataUrl: string): Promise<void>;
  applyRemote(c: Partial<Collections>): Promise<void>;
  /** Signed in: that account's data; null: this computer's offline data. `forget` removes an account's local copy. */
  switchProfile(uid: string | null, forget?: string | null): Promise<void>;
  offlineData(): Promise<Partial<Collections>>;
  /** Doctor-visit documents (photos / PDFs). */
  addDocs(): Promise<PhotoRef[]>;
  openDoc(p: PhotoRef): Promise<void>;
  exportBackup(): Promise<boolean>;
  importBackup(): Promise<'merged' | 'cancelled' | 'invalid'>;
  /** Automatic weekly backups (desktop only; null = not available here). */
  autoBackup: DesktopBridge['autoBackup'] | null;
  getMissed(): Promise<FiredAlert[]>;
  clearMissed(): Promise<void>;
  onMissed(cb: (m: FiredAlert[]) => void): () => void;
  onPlaySound(cb: (soundId: string, soft: boolean) => void): () => void;
  onOpenDate(cb: (date: string) => void): () => void;
  onHidden(cb: (hidden: boolean) => void): () => void;
  /** Web only: in-page alerts (desktop shows its own popup window). */
  onInPageAlert(cb: (alerts: FiredAlert[]) => void): () => void;
  /** Phone: "Taken" / "+ glass" pressed on a notification. */
  onAlertTaken(cb: (alert: FiredAlert) => void): () => void;
  /** Phone: the Android back button (desktop/web: never). */
  onBackButton(cb: () => void): () => void;
  /** Phone: leave the app (back on the main screen). */
  exitApp(): void;
  testPopup(): Promise<void>;
  gameStatus(): Promise<{ available: boolean; gamingNow: boolean; error: string | null }>;
  setTitleBarTheme(dark: boolean): void;
  appVersion(): Promise<string>;
  getUpdateState(): Promise<UpdateState>;
  onUpdateState(cb: (s: UpdateState) => void): () => void;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
}

function desktop(b: DesktopBridge): PlatformAPI {
  return {
    kind: 'desktop',
    os: b.platform,
    load: () => b.load(),
    upsert: (c, i) => b.upsert(c, i),
    remove: (c, id) => b.remove(c, id),
    updateSettings: (p) => b.updateSettings(p),
    onChange: (cb) => b.onChange(cb),
    importSound: () => b.importSound(),
    soundData: (id) => b.soundData(id),
    addPhotos: () => b.addPhotos(),
    readPhoto: (f) => b.readPhoto(f),
    hasPhoto: (f) => b.hasPhoto(f),
    writePhoto: (f, d) => b.writePhoto(f, d),
    applyRemote: (c) => b.applyRemote(c),
    switchProfile: (uid, forget) => b.switchProfile(uid, forget),
    offlineData: () => b.offlineData(),
    addDocs: () => b.addDocs(),
    openDoc: (p) => b.openDoc(p.fileName),
    photoUrl: async (p) => `bloom-photo://p/${encodeURIComponent(p.fileName)}`,
    exportBackup: () => b.exportBackup(),
    importBackup: () => b.importBackup(),
    autoBackup: b.autoBackup,
    getMissed: () => b.getMissed(),
    clearMissed: () => b.clearMissed(),
    onMissed: (cb) => b.onMissed(cb),
    onPlaySound: (cb) => b.onPlaySound(cb),
    onOpenDate: (cb) => b.onOpenDate(cb),
    onHidden: (cb) => b.onHidden(cb),
    onInPageAlert: () => () => {},
    onAlertTaken: () => () => {},
    onBackButton: () => () => {},
    exitApp: () => {},
    testPopup: () => b.testPopup(),
    gameStatus: () => b.gameStatus(),
    setTitleBarTheme: (d) => b.setTitleBarTheme(d),
    appVersion: () => b.appVersion(),
    getUpdateState: () => b.getUpdateState(),
    onUpdateState: (cb) => b.onUpdateState(cb),
    checkForUpdates: () => b.checkForUpdates(),
    installUpdate: () => b.installUpdate(),
  };
}

const LS_KEY = 'bloom-data-v1'; // offline data; an account's copy is `${LS_KEY}:<uid>`
const LS_PROFILE = 'bloom-profile-v1';
const LS_SOUNDS = 'bloom-sounds-v1';
const LS_PHOTOS = 'bloom-photos-v1';

/** Key/value text storage: localStorage in a browser, files on the phone. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Photos and documents, kept as data URLs. */
export interface PhotoStore {
  get(fileName: string): Promise<string | null>;
  has(fileName: string): Promise<boolean>;
  /** Saves several files at once; false = no room. */
  put(entries: Record<string, string>): Promise<boolean>;
}

export interface WebOptions {
  kv?: KV;
  photos?: PhotoStore;
  /** Check reminders inside the page (browser). The phone uses system notifications instead. */
  inPageAlerts?: boolean;
  /** Largest PDF a doctor visit can hold. */
  maxPdfBytes?: number;
}

/** All photos in one localStorage entry (browser). */
function kvPhotos(kv: KV): PhotoStore {
  const all = (): Record<string, string> => {
    try {
      return JSON.parse(kv.getItem(LS_PHOTOS) || '{}');
    } catch {
      return {};
    }
  };
  return {
    get: async (f) => all()[f] ?? null,
    has: async (f) => f in all(),
    put: async (e) => {
      try {
        kv.setItem(LS_PHOTOS, JSON.stringify({ ...all(), ...e }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Browser build only: shrink photos so they fit in localStorage. */
function shrinkImage(file: File, max = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function web(opts: WebOptions = {}): PlatformAPI {
  const kv: KV = opts.kv ?? localStorage;
  const photos = opts.photos ?? kvPhotos(kv);
  const maxPdf = opts.maxPdfBytes ?? 2 * 1024 * 1024; // browser storage is small
  let active: string | null = null;
  let profileKnown = false;
  try {
    const p = JSON.parse(kv.getItem(LS_PROFILE) || 'null');
    profileKnown = p !== null;
    active = p?.active ?? null;
  } catch {
    /* ignore */
  }
  const keyOf = (uid: string | null) => (uid ? `${LS_KEY}:${uid}` : LS_KEY);
  const readKey = (k: string) => {
    try {
      return normalizeSnapshot(JSON.parse(kv.getItem(k) || 'null'));
    } catch {
      return emptySnapshot();
    }
  };
  let snap: Snapshot = readKey(keyOf(active));
  try {
    kv.setItem(keyOf(active), JSON.stringify(snap)); // save upgrades right away
  } catch {
    /* ignore */
  }
  const listeners = new Set<(s: Snapshot) => void>();
  const alertListeners = new Set<(a: FiredAlert[]) => void>();
  const soundListeners = new Set<(id: string, soft: boolean) => void>();
  const set = (next: Snapshot) => {
    snap = next;
    try {
      kv.setItem(keyOf(active), JSON.stringify(next));
    } catch {
      /* storage full or blocked */
    }
    listeners.forEach((l) => l(next));
  };
  const sounds = (): Record<string, string> => {
    try {
      return JSON.parse(kv.getItem(LS_SOUNDS) || '{}');
    } catch {
      return {};
    }
  };

  // In-page scheduler (the desktop app does this in the background process).
  let last = Date.now();
  if (opts.inPageAlerts !== false) setInterval(() => {
    const now = Date.now();
    const due = alertsDueBetween(snap, last, now);
    last = now;
    if (due.length) {
      alertListeners.forEach((l) => l(due));
      soundListeners.forEach((l) => l(due[0].sound, false));
    }
  }, 5000);

  const pickFile = (accept: string) =>
    new Promise<File | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });

  return {
    kind: 'web',
    os: 'web',
    load: async () => snap,
    upsert: async (c, i) => set(upsert(snap, c, i)),
    remove: async (c, id) => set(remove(snap, c, id)),
    updateSettings: async (p) => set(updateSettings(snap, p)),
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    importSound: async () => {
      const f = await pickFile('audio/*');
      if (!f || f.size > 2 * 1024 * 1024) return null;
      const url = await new Promise<string>((r) => {
        const fr = new FileReader();
        fr.onload = () => r(String(fr.result));
        fr.readAsDataURL(f);
      });
      const meta: SoundMeta = { ...newMeta(), name: f.name.replace(/\.[^.]+$/, ''), fileName: f.name };
      try {
        kv.setItem(LS_SOUNDS, JSON.stringify({ ...sounds(), [meta.id]: url }));
      } catch {
        return null;
      }
      set(upsert(snap, 'sounds', meta));
      return meta;
    },
    soundData: async (id) => sounds()[id] ?? null,
    addPhotos: async () => {
      const files = await new Promise<File[]>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = () => resolve([...(input.files ?? [])]);
        input.click();
      });
      const out: PhotoRef[] = [];
      const store: Record<string, string> = {};
      for (const f of files) {
        try {
          const id = uuid();
          store[id + '.jpg'] = await shrinkImage(f);
          out.push({ id, fileName: id + '.jpg', name: f.name });
        } catch {
          /* not an image */
        }
      }
      return (await photos.put(store)) ? out : [];
    },
    readPhoto: (f) => photos.get(f),
    hasPhoto: (f) => photos.has(f),
    writePhoto: async (f, d) => {
      await photos.put({ [f]: d });
    },
    addDocs: async () => {
      const files = await new Promise<File[]>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.multiple = true;
        input.onchange = () => resolve([...(input.files ?? [])]);
        input.click();
      });
      const out: PhotoRef[] = [];
      const store: Record<string, string> = {};
      for (const f of files) {
        const id = uuid();
        const pdf = f.type === 'application/pdf';
        if (pdf && f.size > maxPdf) continue;
        const data = pdf
          ? await new Promise<string>((r) => {
              const fr = new FileReader();
              fr.onload = () => r(String(fr.result));
              fr.readAsDataURL(f);
            })
          : await shrinkImage(f).catch(() => '');
        if (!data) continue;
        const fileName = id + (pdf ? '.pdf' : '.jpg');
        store[fileName] = data;
        out.push({ id, fileName, name: f.name });
      }
      return (await photos.put(store)) ? out : [];
    },
    openDoc: async (p) => {
      const url = await photos.get(p.fileName);
      if (url) window.open(url, '_blank');
    },
    offlineData: async () => {
      if (active === null) return {};
      const s = readKey(LS_KEY);
      return Object.fromEntries(COLLECTIONS.filter((c) => c !== 'sounds').map((c) => [c, s[c]]));
    },
    switchProfile: async (uid, forget) => {
      const first = !profileKnown;
      profileKnown = true;
      const saveProfile = () => {
        try {
          kv.setItem(LS_PROFILE, JSON.stringify({ active }));
        } catch {
          /* ignore */
        }
      };
      if (uid === active && !forget) return saveProfile();
      const settings = snap.settings;
      // First sign-in with this version: the single old data set was this account's.
      if (uid && first && active === null && kv.getItem(keyOf(uid)) === null) {
        try {
          kv.setItem(keyOf(uid), JSON.stringify(snap));
          kv.setItem(LS_KEY, JSON.stringify({ ...emptySnapshot(), settings }));
        } catch {
          /* ignore */
        }
      }
      active = uid;
      saveProfile();
      set({ ...readKey(keyOf(uid)), settings });
      if (forget && forget !== uid) kv.removeItem(keyOf(forget));
    },
    applyRemote: async (c) => {
      const incoming = normalizeSnapshot({ ...snap, ...c });
      for (const k of COLLECTIONS) if (!c[k]) incoming[k] = [];
      set({ ...merge(snap, incoming), settings: snap.settings });
    },
    photoUrl: async (p) => (await photos.get(p.fileName)) ?? '',
    exportBackup: async () => {
      const blob = new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bloom-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      return true;
    },
    importBackup: async () => {
      const f = await pickFile('application/json,.json');
      if (!f) return 'cancelled';
      try {
        const raw = JSON.parse(await f.text());
        if (!Array.isArray(raw?.events)) return 'invalid';
        set({ ...merge(snap, normalizeSnapshot(raw)), settings: snap.settings });
        return 'merged';
      } catch {
        return 'invalid';
      }
    },
    autoBackup: null,
    getMissed: async () => [],
    clearMissed: async () => {},
    onMissed: () => () => {},
    onPlaySound: (cb) => {
      soundListeners.add(cb);
      return () => soundListeners.delete(cb);
    },
    onOpenDate: () => () => {},
    onHidden: () => () => {},
    onInPageAlert: (cb) => {
      alertListeners.add(cb);
      return () => alertListeners.delete(cb);
    },
    onAlertTaken: () => () => {},
    onBackButton: () => () => {},
    exitApp: () => {},
    testPopup: async () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const when = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const a: FiredAlert = { key: `test@${Date.now()}`, sourceId: 'test', kind: 'reminder', title: 'Test reminder 🌸', when, dueAt: Date.now(), minutesBefore: 0, sound: snap.settings.defaultSound };
      alertListeners.forEach((l) => l([a]));
      soundListeners.forEach((l) => l(a.sound, false));
    },
    gameStatus: async () => ({ available: false, gamingNow: false, error: null }),
    setTitleBarTheme: () => {},
    appVersion: async () => 'web',
    getUpdateState: async () => ({ status: 'unsupported' }),
    onUpdateState: () => () => {},
    checkForUpdates: async () => {},
    installUpdate: async () => {},
  };
}

const isAndroid = Capacitor.getPlatform() === 'android';

/**
 * The device Bloom runs on. Desktop and browser are ready at once; the phone
 * first reads its files, so main.tsx waits for `platformReady` before the UI.
 */
export let platform: PlatformAPI = window.bloomDesktop ? desktop(window.bloomDesktop) : isAndroid ? (null as unknown as PlatformAPI) : web();

export const platformReady: Promise<void> = isAndroid
  ? import('./android').then(async (m) => {
      platform = await m.createAndroid(web);
    })
  : Promise.resolve();

/** Phone layout: the Android app, or `?phone` in a browser (for testing). */
export const isPhone = isAndroid || new URLSearchParams(location.search).has('phone');
