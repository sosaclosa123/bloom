/// <reference types="vite/client" />
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
      applySettings: (patch) => platform.updateSettings(patch),
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
    // A PC's settings win over a brand-new phone's defaults the first time (see engine.ts).
    // QA only (dev server, never in a release build): the local Firebase emulator.
    const emu = import.meta.env.DEV ? localStorage.getItem('qa-emulator') : null;
    const backend = emu
      ? createFirebaseBackend({ projectId: 'demo-bloom', apiKey: 'demo-key', authDomain: 'demo-bloom.firebaseapp.com' }, { host: emu.split(':')[0], firestorePort: Number(emu.split(':')[1]), authPort: 9099 })
      : createFirebaseBackend(firebaseConfig!);
    engine = new SyncEngine(backend, port, { prefsFirstWeight: platform.kind === 'desktop' ? 2 : 1 });
    engine.start();
    // Hidden (phone in the background, PC minimized): send everything now, so a
    // change or deletion isn't lost if the app is closed right after. Back after
    // a while: listen again from scratch so changes from other devices show.
    let hiddenAt = 0;
    const onVisibility = (hidden: boolean) => {
      if (!engine) return;
      if (hidden) {
        hiddenAt = Date.now();
        void engine.flush(); // right away: Android may stop the app any moment now
      } else if (hiddenAt && Date.now() - hiddenAt > 15_000) {
        hiddenAt = 0;
        engine.refresh();
      }
    };
    document.addEventListener('visibilitychange', () => onVisibility(document.visibilityState === 'hidden'));
    platform.onHidden(onVisibility);
    window.addEventListener('online', () => engine?.refresh());
    // A live connection can also go quiet without any error (sleep, Wi-Fi
    // changes, a PC left in the tray for days): listen again every 10 minutes.
    // Cheap: only what changed is downloaded.
    // Also right after the PC wakes from sleep (or the phone un-freezes): the
    // clock jumps between two ticks.
    let lastTick = Date.now();
    let lastRefresh = Date.now();
    setInterval(() => {
      const now = Date.now();
      if (now - lastTick > 90_000 || now - lastRefresh > 10 * 60_000) {
        lastRefresh = now;
        engine?.refresh();
      }
      lastTick = now;
    }, 30_000);
    return engine;
  })();
  return starting;
}

/** Signed in to an account right now (settings can then sync to other devices). */
export function syncSignedIn(): boolean {
  // QA only (dev server, never in a release build): pretend to be signed in.
  if (import.meta.env.DEV && localStorage.getItem('qa-signed-in')) return true;
  return !!engine?.get().user;
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
