// Weekly copy of all Bloom data (Health included) to a folder the person
// chose (e.g. OneDrive). Keeps the last 8 copies there. Checked at start-up
// and every few hours while Bloom runs.
import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { autoBackupDue, autoBackupName, backupsToDelete, type AutoBackupState } from '../src/shared/backup';
import { StateFile, type FileStore } from './store';

const CHECK_MS = 3 * 3600 * 1000;

export class AutoBackup {
  private state = new StateFile<{ last: number | null; error: string | null }>('auto-backup.json', { last: null, error: null });
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private store: FileStore,
    private onChange: (s: AutoBackupState) => void,
  ) {}

  private folder(): string | null {
    return this.store.get().settings.backupFolder ?? null;
  }

  get(): AutoBackupState {
    const s = this.state.read();
    return { folder: this.folder(), last: s.last, error: s.error };
  }

  start() {
    this.check();
    this.timer = setInterval(() => this.check(), CHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs the weekly backup if it's due. */
  check() {
    if (this.folder() && autoBackupDue(this.state.read().last, Date.now())) this.run();
  }

  /** Back up now: the current data file (saved first) goes into the folder. */
  run(): AutoBackupState {
    const folder = this.folder();
    if (!folder) return this.get();
    try {
      if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error('folder-missing');
      this.store.flush();
      copyFileSync(this.store.file, join(folder, autoBackupName(new Date())));
      for (const f of backupsToDelete(readdirSync(folder))) {
        try {
          unlinkSync(join(folder, f));
        } catch {
          /* keep going */
        }
      }
      this.state.write({ last: Date.now(), error: null });
    } catch (e) {
      const prev = this.state.read();
      this.state.write({ last: prev.last, error: e instanceof Error && e.message === 'folder-missing' ? 'folder-missing' : 'write-failed' });
    }
    const s = this.get();
    this.onChange(s);
    return s;
  }
}
