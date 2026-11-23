// Stores all calendar data as one JSON file in the user's AppData folder.
// Writes are atomic (temp file + rename) and a daily backup copy is kept.
//
// Profiles: signed out = this computer's own offline data (bloom-data.json).
// Signed in = that account's data (accounts/<uid>.json, a working copy of what
// is online). Signing out switches back to the offline data and removes the
// account's copy, so the account's things only live online (and in backups).
// Settings belong to the computer and stay the same in every profile.
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLLECTIONS, compact, normalizeSnapshot } from '../src/shared/db';
import type { Collections, Snapshot } from '../src/shared/types';

const KEEP_BACKUPS = 14;
const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;

export class FileStore {
  readonly dir = app.getPath('userData');
  readonly localFile = join(this.dir, 'bloom-data.json');
  readonly accountsDir = join(this.dir, 'accounts');
  private profileFile = join(this.dir, 'profile.json');
  /** Signed-in account whose data is shown, or null = offline data. */
  active: string | null = null;
  file = this.localFile;
  readonly backupDir = join(this.dir, 'backups');
  readonly soundsDir = join(this.dir, 'sounds');
  readonly photosDir = join(this.dir, 'photos');
  private snap: Snapshot;
  private writeTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<(s: Snapshot) => void>();

  constructor() {
    mkdirSync(this.dir, { recursive: true });
    mkdirSync(this.backupDir, { recursive: true });
    mkdirSync(this.soundsDir, { recursive: true });
    mkdirSync(this.photosDir, { recursive: true });
    mkdirSync(this.accountsDir, { recursive: true });
    const prof = this.readProfile();
    if (prof?.active && SAFE_UID.test(prof.active)) {
      this.active = prof.active;
      this.file = this.accountFile(prof.active);
    }
    this.dailyBackup(); // copy of the file as it was, before any upgrade
    this.snap = this.read();
    this.writeNow(compact(this.snap)); // save upgrades (e.g. data migrations) right away
  }

  private accountFile(uid: string) {
    return join(this.accountsDir, `${uid}.json`);
  }

  private readProfile(): { active: string | null } | null {
    try {
      return JSON.parse(readFileSync(this.profileFile, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Show another profile: an account (uid) or the offline data (null).
   * `forget`: the account copy to delete afterwards (signing out).
   * The very first time this version signs in, the existing single data file
   * was that account's data (older versions had one file), so it becomes the
   * account's copy and the offline data starts empty.
   */
  switchProfile(uid: string | null, forget?: string | null) {
    if (uid && !SAFE_UID.test(uid)) return;
    const firstTime = this.readProfile() === null;
    if (uid === this.active && !forget) {
      if (firstTime) this.writeProfile();
      return;
    }
    this.flush();
    const settings = this.snap.settings;
    if (uid && firstTime && this.active === null && !existsSync(this.accountFile(uid))) {
      try {
        copyFileSync(this.localFile, this.accountFile(uid));
        this.writeNow({ ...normalizeSnapshot(null), settings });
      } catch {
        /* keep going: the account data will download again */
      }
    }
    this.active = uid;
    this.file = uid ? this.accountFile(uid) : this.localFile;
    const next = existsSync(this.file) ? this.read() : normalizeSnapshot(null);
    this.snap = { ...next, settings };
    this.writeNow(compact(this.snap));
    this.writeProfile();
    if (forget && forget !== uid && SAFE_UID.test(forget)) {
      try {
        for (const f of [this.accountFile(forget), this.accountFile(forget) + '.tmp']) if (existsSync(f)) unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    for (const l of this.listeners) l(this.snap);
  }

  /** The offline data's records (sounds stay per computer, so they're left out). */
  offlineData(): Partial<Collections> {
    if (this.active === null) return {};
    try {
      const s = normalizeSnapshot(JSON.parse(readFileSync(this.localFile, 'utf8')));
      return Object.fromEntries(COLLECTIONS.filter((c) => c !== 'sounds').map((c) => [c, s[c]]));
    } catch {
      return {};
    }
  }

  private writeProfile() {
    try {
      writeFileSync(this.profileFile, JSON.stringify({ active: this.active }), 'utf8');
    } catch {
      /* ignore */
    }
  }

  private read(): Snapshot {
    for (const f of [this.file, this.file + '.tmp']) {
      if (!existsSync(f)) continue;
      try {
        return normalizeSnapshot(JSON.parse(readFileSync(f, 'utf8')));
      } catch {
        // Corrupt file: keep a copy for recovery and try the next candidate.
        try {
          copyFileSync(f, f + `.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
    }
    const fresh = normalizeSnapshot(null);
    this.writeNow(fresh);
    return fresh;
  }

  get(): Snapshot {
    return this.snap;
  }

  set(next: Snapshot) {
    this.snap = next;
    for (const l of this.listeners) l(next);
    this.scheduleWrite();
  }

  onChange(fn: (s: Snapshot) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private scheduleWrite() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    this.writeNow(compact(this.snap));
  }

  private writeNow(s: Snapshot) {
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(s, null, 1), 'utf8');
    renameSync(tmp, this.file);
  }

  private dailyBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    const target = join(this.backupDir, `bloom-${stamp}${this.active ? '-account' : ''}.json`);
    try {
      if (!existsSync(target) && existsSync(this.file)) copyFileSync(this.file, target);
      const all = readdirSync(this.backupDir)
        .filter((f) => f.startsWith('bloom-') && f.endsWith('.json'))
        .sort();
      for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) unlinkSync(join(this.backupDir, f));
    } catch {
      /* backups are best effort */
    }
  }
}

/** Small separate file for scheduler bookkeeping (not user data, never synced). */
export class StateFile<T extends object> {
  private file: string;
  constructor(name: string, private fallback: T) {
    this.file = join(app.getPath('userData'), name);
  }
  read(): T {
    try {
      return { ...this.fallback, ...JSON.parse(readFileSync(this.file, 'utf8')) };
    } catch {
      return { ...this.fallback };
    }
  }
  write(v: T) {
    try {
      writeFileSync(this.file, JSON.stringify(v), 'utf8');
    } catch {
      /* ignore */
    }
  }
}
