// Stores all calendar data as one JSON file in the user's AppData folder.
// Writes are atomic (temp file + rename) and a daily backup copy is kept.
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { compact, normalizeSnapshot } from '../src/shared/db';
import type { Snapshot } from '../src/shared/types';

const KEEP_BACKUPS = 14;

export class FileStore {
  readonly dir = app.getPath('userData');
  readonly file = join(this.dir, 'bloom-data.json');
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
    this.dailyBackup(); // copy of the file as it was, before any upgrade
    this.snap = this.read();
    this.writeNow(compact(this.snap)); // save upgrades (e.g. data migrations) right away
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
    const target = join(this.backupDir, `bloom-${stamp}.json`);
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
