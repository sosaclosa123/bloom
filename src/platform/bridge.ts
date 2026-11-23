// The contract between the UI and the desktop shell (Electron preload).
// A phone build later implements the same PlatformAPI (see api.ts) with
// phone storage and native notifications instead.
import type { AutoBackupState } from '../shared/backup';
import type { CollectionName, Collections, FiredAlert, PhotoRef, RecordOf, Settings, Snapshot, SoundMeta } from '../shared/types';

export type DeliveryReason = 'now' | 'afterGame' | 'whileClosed';

export type UpdateState =
  | { status: 'idle' | 'checking' | 'up-to-date' | 'unsupported' }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

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
  readPhoto(fileName: string): Promise<string | null>;
  hasPhoto(fileName: string): Promise<boolean>;
  writePhoto(fileName: string, dataUrl: string): Promise<void>;
  applyRemote(c: Partial<Collections>): Promise<void>;
  /** Show an account's data (uid) or this computer's offline data (null); `forget` deletes that account's local copy. */
  switchProfile(uid: string | null, forget?: string | null): Promise<void>;
  /** Pick documents (photos / PDFs) for a doctor visit; open one with the system viewer. */
  addDocs(): Promise<PhotoRef[]>;
  openDoc(fileName: string): Promise<void>;
  /** This computer's offline data (shown when signed out). */
  offlineData(): Promise<Partial<Collections>>;

  exportBackup(): Promise<boolean>;
  importBackup(): Promise<'merged' | 'cancelled' | 'invalid'>;
  /** Automatic weekly backups to a chosen folder. */
  autoBackup: {
    get(): Promise<AutoBackupState>;
    choose(): Promise<AutoBackupState>;
    run(): Promise<AutoBackupState>;
    off(): Promise<AutoBackupState>;
    onChange(cb: (s: AutoBackupState) => void): () => void;
  };

  getMissed(): Promise<FiredAlert[]>;
  clearMissed(): Promise<void>;
  onMissed(cb: (missed: FiredAlert[]) => void): () => void;
  onPlaySound(cb: (soundId: string, soft: boolean) => void): () => void;
  onOpenDate(cb: (date: string) => void): () => void;
  /** The window went to the tray / was minimized (true) or came back (false). */
  onHidden(cb: (hidden: boolean) => void): () => void;
  testPopup(): Promise<void>;
  gameStatus(): Promise<{ available: boolean; gamingNow: boolean; error: string | null }>;
  setTitleBarTheme(dark: boolean): void;

  appVersion(): Promise<string>;
  getUpdateState(): Promise<UpdateState>;
  onUpdateState(cb: (s: UpdateState) => void): () => void;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;

  /** The small "Coming up" window shown when the PC starts. */
  glance: {
    open(date: string): void;
    close(): void;
    resize(height: number): void;
  };
  popup: {
    onAlerts(cb: (alerts: FiredAlert[], reason: DeliveryReason, lang: string, dark: boolean) => void): () => void;
    ready(): void;
    snooze(key: string, minutes: number): void;
    dismiss(key: string): void;
    dismissAll(): void;
    /** Medication reminder: mark the dose as taken. */
    taken(key: string): void;
    open(date: string): void;
    resize(height: number): void;
  };
}

declare global {
  interface Window {
    bloomDesktop?: DesktopBridge;
  }
}
