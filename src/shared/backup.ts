// Automatic backups to a folder the person chooses (e.g. OneDrive): pure rules.
// The desktop app (electron/autoBackup.ts) does the file work.

export const AUTO_BACKUP_KEEP = 8;
export const AUTO_BACKUP_EVERY_MS = 7 * 24 * 3600 * 1000; // weekly

/** File name for a backup made on `d` (local date). */
export function autoBackupName(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `bloom-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

const OURS = /^bloom-backup-\d{4}-\d{2}-\d{2}\.json$/;

/** Our own backup files beyond the newest `keep` (other files are never touched). */
export function backupsToDelete(names: string[], keep = AUTO_BACKUP_KEEP): string[] {
  const ours = names.filter((n) => OURS.test(n)).sort();
  return ours.slice(0, Math.max(0, ours.length - keep));
}

/** A weekly backup is due (or none was made yet). */
export function autoBackupDue(last: number | null, now: number): boolean {
  return last == null || now - last >= AUTO_BACKUP_EVERY_MS;
}

export interface AutoBackupState {
  folder: string | null;
  last: number | null;
  error: string | null;
}
