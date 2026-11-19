// App-wide state: the data snapshot, actions, translation and toasts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dirFor, localeFor, translate, type StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { alive } from '../shared/db';
import { setCustomMonthColors } from './season';
import type { CollectionName, RecordOf, Settings, Snapshot } from '../shared/types';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface Ctx {
  snap: Snapshot;
  settings: Settings;
  t: (k: StringKey, vars?: Record<string, string | number>) => string;
  locale: string;
  dir: 'ltr' | 'rtl';
  dark: boolean;
  save: <C extends CollectionName>(coll: C, item: RecordOf<C>) => void;
  /** Deletes with an "Undo" toast. */
  del: <C extends CollectionName>(coll: C, item: RecordOf<C>, label?: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  toast: (text: string, action?: Toast['action']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const BloomCtx = createContext<Ctx | null>(null);

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = () => setDark(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return dark;
}

export function BloomProvider({ initial, children }: { initial: Snapshot; children: ReactNode }) {
  const [snap, setSnap] = useState(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const systemDark = useSystemDark();

  useEffect(() => platform.onChange(setSnap), []);

  const settings = snap.settings;
  setCustomMonthColors(settings.monthColors); // month colors chosen in the Year view
  const dark = settings.theme === 'system' ? systemDark : settings.theme === 'dark';
  const dir = dirFor(settings.language);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.lang = settings.language;
    document.documentElement.dir = dir;
    platform.setTitleBarTheme(dark);
  }, [dark, dir, settings.language]);

  const t = useCallback(
    (k: StringKey, vars?: Record<string, string | number>) => translate(settings.language, k, vars),
    [settings.language],
  );

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, action?: Toast['action']) => {
      const id = ++toastId.current;
      setToasts((ts) => [...ts.slice(-2), { id, text, action }]);
      setTimeout(() => dismissToast(id), action ? 6000 : 2600);
    },
    [dismissToast],
  );

  const save = useCallback(<C extends CollectionName>(coll: C, item: RecordOf<C>) => {
    // Optimistic update so typing feels instant; the platform echoes the result.
    setSnap((s) => {
      const list = s[coll] as RecordOf<C>[];
      const idx = list.findIndex((x) => x.id === item.id);
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? item : x)) : [...list, item];
      return { ...s, [coll]: next };
    });
    platform.upsert(coll, item);
  }, []);

  const del = useCallback(
    <C extends CollectionName>(coll: C, item: RecordOf<C>, label?: string) => {
      platform.remove(coll, item.id);
      toast(label ?? translate(settings.language, 'deleted'), {
        label: translate(settings.language, 'undo'),
        run: () => platform.upsert(coll, { ...item, deletedAt: null }),
      });
    },
    [toast, settings.language],
  );

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSnap((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    platform.updateSettings(patch);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      snap,
      settings,
      t,
      locale: localeFor(settings.language),
      dir,
      dark,
      save,
      del,
      setSettings,
      toast,
      toasts,
      dismissToast,
    }),
    [snap, settings, t, dir, dark, save, del, setSettings, toast, toasts, dismissToast],
  );
  return <BloomCtx.Provider value={value}>{children}</BloomCtx.Provider>;
}

export function useBloom(): Ctx {
  const c = useContext(BloomCtx);
  if (!c) throw new Error('useBloom outside provider');
  return c;
}

/** Live (non-deleted) records of a collection. */
export function useAlive<C extends CollectionName>(coll: C): RecordOf<C>[] {
  const { snap } = useBloom();
  return useMemo(() => alive(snap[coll] as RecordOf<C>[]) as RecordOf<C>[], [snap, coll]);
}
