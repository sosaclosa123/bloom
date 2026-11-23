// Starts sync (when a Firebase project is configured) and exposes its state.
import { useEffect, useState } from 'react';
import { platform } from '../platform/api';
import type { Snapshot } from '../shared/types';
import { firebaseConfig } from '../sync/config';
import { SyncEngine, type LocalPort, type SyncState } from '../sync/engine';

let engine: SyncEngine | null = null;
let starting: Promise<SyncEngine | null> | null = null;

/** Shrinks a photo so it fits in one online document (~1 MB). */
async function compress(dataUrl: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  for (const [max, q] of [
    [1600, 0.82],
    [1200, 0.75],
    [900, 0.7],
  ] as const) {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', q);
    if (out.length < 900_000) return out;
  }
  return '';
}

export function startSync(): Promise<SyncEngine | null> {
  if (!firebaseConfig) return Promise.resolve(null);
  if (starting) return starting;
  starting = (async () => {
    const { createFirebaseBackend } = await import('../sync/firebase');
    let snap: Snapshot = await platform.load();
    platform.onChange((s) => (snap = s));
    const port: LocalPort = {
      snapshot: () => snap,
      onChange: (cb) => platform.onChange(cb),
      applyRemote: (c) => platform.applyRemote(c),
      readPhoto: async (f) => {
        const raw = await platform.readPhoto(f);
        if (!raw) return null;
        // PDFs go as they are (only small ones fit online; bigger ones stay on this computer and in backups).
        if (raw.startsWith('data:application/pdf')) return raw;
        return compress(raw).catch(() => null);
      },
      hasPhoto: (f) => platform.hasPhoto(f),
      writePhoto: (f, d) => platform.writePhoto(f, d),
      switchProfile: (uid, forget) => platform.switchProfile(uid, forget),
      getItem: (k) => {
        try {
          return localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* ignore */
        }
      },
    };
    engine = new SyncEngine(createFirebaseBackend(firebaseConfig!), port);
    engine.start();
    return engine;
  })();
  return starting;
}

const OFF: SyncState = { user: null, profile: null, space: null, status: 'off', error: null, lastSync: null };

export function useSync(): { state: SyncState; engine: SyncEngine | null; available: boolean } {
  const [state, setState] = useState<SyncState>(engine?.get() ?? OFF);
  const [eng, setEng] = useState<SyncEngine | null>(engine);
  useEffect(() => {
    let off: (() => void) | undefined;
    startSync().then((e) => {
      if (!e) return;
      setEng(e);
      off = e.subscribe(setState);
    });
    return () => off?.();
  }, []);
  return { state, engine: eng, available: !!firebaseConfig };
}
