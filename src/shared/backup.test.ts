import { describe, expect, it } from 'vitest';
import { autoBackupDue, autoBackupName, backupsToDelete } from './backup';

describe('automatic backups', () => {
  it('names files by date and keeps the newest 8 of our own files', () => {
    expect(autoBackupName(new Date(2026, 10, 3))).toBe('bloom-backup-2026-11-03.json');
    const names = Array.from({ length: 10 }, (_, i) => autoBackupName(new Date(2026, 0, 1 + i * 7)));
    expect(backupsToDelete([...names, 'notes.txt', 'bloom-backup-old.json'])).toEqual([names[0], names[1]]);
    expect(backupsToDelete(names.slice(0, 3))).toEqual([]);
  });
  it('is due weekly', () => {
    const now = Date.now();
    expect(autoBackupDue(null, now)).toBe(true);
    expect(autoBackupDue(now - 6 * 86400000, now)).toBe(false);
    expect(autoBackupDue(now - 7 * 86400000, now)).toBe(true);
  });
});
