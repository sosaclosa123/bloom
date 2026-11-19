// PlatformAPI: everything the UI needs from the device it runs on.
//  - desktop (Windows): Electron bridge, JSON file, tray, game-aware popups
//  - web (dev / future PWA): localStorage + in-page reminders
//  - phone (future): implement this same interface with Capacitor/React Native
import { alertsDueBetween } from '../shared/alerts';
import { COLLECTIONS, emptySnapshot, merge, newMeta, normalizeSnapshot, remove, updateSettings, upsert } from '../shared/db';
import type { CollectionName, Collections, FiredAlert, PhotoRef, RecordOf, Settings, Snapshot, SoundMeta } from '../shared/types';
import { uuid } from '../shared/db';
import type { DesktopBridge, UpdateState } from './bridge';
export type { UpdateState };

export interface PlatformAPI {
  kind: 'desktop' | 'web';
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
  exportBackup(): Promise<boolean>;
  importBackup(): Promise<'merged' | 'cancelled' | 'invalid'>;
  getMissed(): Promise<FiredAlert[]>;
  clearMissed(): Promise<void>;
  onMissed(cb: (m: FiredAlert[]) => void): () => void;
  onPlaySound(cb: (soundId: string, soft: boolean) => void): () => void;
  onOpenDate(cb: (date: string) => void): () => void;
  /** Web only: in-page alerts (desktop shows its own popup window). */
  onInPageAlert(cb: (alerts: FiredAlert[]) => void): () => void;
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
    photoUrl: async (p) => `bloom-photo://p/${encodeURIComponent(p.fileName)}`,
    exportBackup: () => b.exportBackup(),
    importBackup: () => b.importBackup(),
    getMissed: () => b.getMissed(),
    clearMissed: () => b.clearMissed(),
    onMissed: (cb) => b.onMissed(cb),
    onPlaySound: (cb) => b.onPlaySound(cb),
    onOpenDate: (cb) => b.onOpenDate(cb),
    onInPageAlert: () => () => {},
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

const LS_KEY = 'bloom-data-v1';
const LS_SOUNDS = 'bloom-sounds-v1';
const LS_PHOTOS = 'bloom-photos-v1';

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

function web(): PlatformAPI {
  let snap: Snapshot;
  try {
    snap = normalizeSnapshot(JSON.parse(localStorage.getItem(LS_KEY) || 'null'));
  } catch {
    snap = emptySnapshot();
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snap)); // save upgrades right away
  } catch {
    /* ignore */
  }
  const listeners = new Set<(s: Snapshot) => void>();
  const alertListeners = new Set<(a: FiredAlert[]) => void>();
  const soundListeners = new Set<(id: string, soft: boolean) => void>();
  const set = (next: Snapshot) => {
    snap = next;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked */
    }
    listeners.forEach((l) => l(next));
  };
  const sounds = (): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(LS_SOUNDS) || '{}');
    } catch {
      return {};
    }
  };

  // In-page scheduler (the desktop app does this in the background process).
  let last = Date.now();
  setInterval(() => {
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
        localStorage.setItem(LS_SOUNDS, JSON.stringify({ ...sounds(), [meta.id]: url }));
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
      let store: Record<string, string> = {};
      try {
        store = JSON.parse(localStorage.getItem(LS_PHOTOS) || '{}');
      } catch {
        /* ignore */
      }
      for (const f of files) {
        try {
          const id = uuid();
          store[id + '.jpg'] = await shrinkImage(f);
          out.push({ id, fileName: id + '.jpg', name: f.name });
        } catch {
          /* not an image */
        }
      }
      try {
        localStorage.setItem(LS_PHOTOS, JSON.stringify(store));
      } catch {
        return [];
      }
      return out;
    },
    readPhoto: async (f) => {
      try {
        return JSON.parse(localStorage.getItem(LS_PHOTOS) || '{}')[f] ?? null;
      } catch {
        return null;
      }
    },
    hasPhoto: async (f) => {
      try {
        return f in JSON.parse(localStorage.getItem(LS_PHOTOS) || '{}');
      } catch {
        return false;
      }
    },
    writePhoto: async (f, d) => {
      try {
        const all = JSON.parse(localStorage.getItem(LS_PHOTOS) || '{}');
        all[f] = d;
        localStorage.setItem(LS_PHOTOS, JSON.stringify(all));
      } catch {
        /* storage full */
      }
    },
    applyRemote: async (c) => {
      const incoming = normalizeSnapshot({ ...snap, ...c });
      for (const k of COLLECTIONS) if (!c[k]) incoming[k] = [];
      set({ ...merge(snap, incoming), settings: snap.settings });
    },
    photoUrl: async (p) => {
      try {
        return JSON.parse(localStorage.getItem(LS_PHOTOS) || '{}')[p.fileName] ?? '';
      } catch {
        return '';
      }
    },
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
    getMissed: async () => [],
    clearMissed: async () => {},
    onMissed: () => () => {},
    onPlaySound: (cb) => {
      soundListeners.add(cb);
      return () => soundListeners.delete(cb);
    },
    onOpenDate: () => () => {},
    onInPageAlert: (cb) => {
      alertListeners.add(cb);
      return () => alertListeners.delete(cb);
    },
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

export const platform: PlatformAPI = window.bloomDesktop ? desktop(window.bloomDesktop) : web();
