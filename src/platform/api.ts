// PlatformAPI: everything the UI needs from the device it runs on.
//  - desktop (Windows): Electron bridge, JSON file, tray, game-aware popups
//  - web (dev / future PWA): localStorage + in-page reminders
//  - phone (future): implement this same interface with Capacitor/React Native
import { alertsDueBetween } from '../shared/alerts';
import { emptySnapshot, merge, newMeta, normalizeSnapshot, remove, updateSettings, upsert } from '../shared/db';
import type { CollectionName, FiredAlert, RecordOf, Settings, Snapshot, SoundMeta } from '../shared/types';
import type { DesktopBridge } from './bridge';

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
  };
}

const LS_KEY = 'bloom-data-v1';
const LS_SOUNDS = 'bloom-sounds-v1';

function web(): PlatformAPI {
  let snap: Snapshot;
  try {
    snap = normalizeSnapshot(JSON.parse(localStorage.getItem(LS_KEY) || 'null'));
  } catch {
    snap = emptySnapshot();
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
  };
}

export const platform: PlatformAPI = window.bloomDesktop ? desktop(window.bloomDesktop) : web();
