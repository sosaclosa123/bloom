// The contract between the UI and the desktop shell (Electron preload).
// A phone build later implements the same PlatformAPI (see api.ts) with
// phone storage and native notifications instead.
import type { CollectionName, FiredAlert, PhotoRef, RecordOf, Settings, Snapshot, SoundMeta } from '../shared/types';

export type DeliveryReason = 'now' | 'afterGame' | 'whileClosed';

export interface DesktopBridge {
  platform: string;
  load(): Promise<Snapshot>;
  upsert<C extends CollectionName>(coll: C, item: RecordOf<C>): Promise<void>;
  remove(coll: CollectionName, id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  onChange(cb: (s: Snapshot) => void): () => void;

  importSound(): Promise<SoundMeta | null>;
  soundData(id: string): Promise<string | null>;
  addPhotos(): Promise<PhotoRef[]>;

  exportBackup(): Promise<boolean>;
  importBackup(): Promise<'merged' | 'cancelled' | 'invalid'>;

  getMissed(): Promise<FiredAlert[]>;
  clearMissed(): Promise<void>;
  onMissed(cb: (missed: FiredAlert[]) => void): () => void;
  onPlaySound(cb: (soundId: string, soft: boolean) => void): () => void;
  onOpenDate(cb: (date: string) => void): () => void;
  testPopup(): Promise<void>;
  gameStatus(): Promise<{ available: boolean; gamingNow: boolean; error: string | null }>;
  setTitleBarTheme(dark: boolean): void;

  popup: {
    onAlerts(cb: (alerts: FiredAlert[], reason: DeliveryReason, lang: string, dark: boolean) => void): () => void;
    ready(): void;
    snooze(key: string, minutes: number): void;
    dismiss(key: string): void;
    dismissAll(): void;
    open(date: string): void;
    resize(height: number): void;
  };
}

declare global {
  interface Window {
    bloomDesktop?: DesktopBridge;
  }
}
