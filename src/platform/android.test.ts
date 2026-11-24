// The phone app's own logic, with Capacitor's native plugins replaced by fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySnapshot } from '../shared/db';
import type { CalendarEvent, Snapshot } from '../shared/types';

const files = new Map<string, string>();
// Shared folders (Documents / the app's own folder) get a prefix; app data doesn't.
const at = (path: string, directory?: string) => (directory === 'DOCUMENTS' || directory === 'EXTERNAL' ? `${directory}:${path}` : path);
let documentsBlocked = false;
const scheduled: { id: number; title: string; schedule: { at: Date } }[] = [];
const listeners: Record<string, (x: unknown) => void> = {};

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Cache: 'CACHE', Documents: 'DOCUMENTS', External: 'EXTERNAL' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readdir: async ({ path, directory }: { path: string; directory?: string }) => {
      const dir = at(path, directory);
      const names = [...files.keys()].filter((k) => k.startsWith(dir + '/')).map((k) => ({ name: k.slice(dir.length + 1) }));
      if (!names.length) throw new Error('no dir');
      return { files: names };
    },
    readFile: async ({ path }: { path: string }) => {
      if (!files.has(path)) throw new Error('missing');
      return { data: files.get(path) };
    },
    writeFile: async ({ path, data, directory }: { path: string; data: string; directory?: string }) => {
      if (directory === 'DOCUMENTS' && documentsBlocked) throw new Error('denied');
      files.set(at(path, directory), data);
    },
    deleteFile: async ({ path, directory }: { path: string; directory?: string }) => {
      if (!files.delete(at(path, directory))) throw new Error('missing');
    },
    requestPermissions: async () => ({ publicStorage: 'denied' }),
    rename: async ({ from, to }: { from: string; to: string }) => {
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    stat: async ({ path }: { path: string }) => {
      if (!files.has(path)) throw new Error('missing');
      return {};
    },
    getUri: async ({ path }: { path: string }) => ({ uri: 'file:///x/' + path }),
    addListener: async () => ({ remove: async () => {} }),
    downloadFile: async () => ({}),
  },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: async () => {},
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    registerActionTypes: async () => {},
    getPending: async () => ({ notifications: scheduled.map((n) => ({ id: n.id })) }),
    cancel: async () => void scheduled.splice(0),
    schedule: async ({ notifications }: { notifications: typeof scheduled }) => void scheduled.push(...notifications),
    addListener: async (name: string, cb: (x: unknown) => void) => {
      listeners[name] = cb;
      return { remove: async () => {} };
    },
  },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (name: string, cb: (x: unknown) => void) => {
      listeners[name] = cb;
      return { remove: async () => {} };
    },
    getInfo: async () => ({ version: '0.2.100' }),
    minimizeApp: async () => {},
  },
}));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ openFile: async () => {}, shareFile: async () => {} }),
  SystemBars: { setStyle: async () => {} },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' },
}));

const { createAndroid, isNewer, plannedAlerts } = await import('./android');

const event = (start: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e' + start,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  ownerId: 'local',
  visibility: 'private',
  title: 'Dentist',
  allDay: false,
  start,
  end: start,
  color: 'sky',
  notes: '',
  location: '',
  repeat: 'none',
  remindBefore: [15],
  sound: 'builtin:chime',
  ...extra,
});

describe('android helpers', () => {
  it('compares versions', () => {
    expect(isNewer('0.2.101', '0.2.100')).toBe(true);
    expect(isNewer('0.3.1', '0.2.900')).toBe(true);
    expect(isNewer('0.2.100', '0.2.100')).toBe(false);
    expect(isNewer('0.2.99', '0.2.100')).toBe(false);
  });

  it('plans a month of reminders plus snoozes, soonest first', () => {
    const now = new Date('2026-11-19T10:00').getTime();
    const snap: Snapshot = { ...emptySnapshot(), events: [event('2026-11-20T10:00'), event('2026-11-19T12:00'), event('2027-01-30T10:00')] };
    const snoozed = { ...plannedAlerts(snap, now, [])[0] };
    const list = plannedAlerts(snap, now, [{ alert: snoozed, until: now + 600000 }]);
    expect(list.map((a) => a.when)).toEqual(['2026-11-19T12:00', '2026-11-19T12:00', '2026-11-20T10:00']);
    expect(list[0].key).toContain('~'); // the snooze comes first
  });
});

describe('createAndroid', () => {
  beforeEach(() => {
    files.clear();
    scheduled.splice(0);
  });

  // A stand-in for the browser platform that keeps everything in the given KV.
  const fakeWeb = (o: { kv?: { getItem(k: string): string | null; setItem(k: string, v: string): void } }) => {
    let snap: Snapshot = JSON.parse(o.kv!.getItem('snap') || 'null') ?? emptySnapshot();
    const ls = new Set<(s: Snapshot) => void>();
    return {
      load: async () => snap,
      upsert: async (_c: string, item: CalendarEvent) => {
        snap = { ...snap, events: [...snap.events, item] };
        o.kv!.setItem('snap', JSON.stringify(snap));
        ls.forEach((l) => l(snap));
      },
      onChange: (cb: (s: Snapshot) => void) => {
        ls.add(cb);
        return () => ls.delete(cb);
      },
    } as never;
  };

  it('keeps data in files and schedules notifications when it changes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'], now: new Date('2026-11-19T10:00') });
    const p = await createAndroid(fakeWeb);
    expect(p.kind).toBe('android');
    await p.upsert('events', event('2026-11-19T12:00'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(scheduled.map((n) => n.title)).toEqual(['Dentist']);
    expect(scheduled[0].schedule.at.getTime()).toBe(new Date('2026-11-19T11:45').getTime());
    // Saved to a file, and read back by the next start.
    expect([...files.keys()].some((k) => k.startsWith('kv/snap'))).toBe(true);
    const again = await createAndroid(fakeWeb);
    expect((await again.load()).events).toHaveLength(1);
    vi.useRealTimers();
  });

  it('a tap on a notification opens its day, even before the app listens', async () => {
    const p = await createAndroid(fakeWeb);
    listeners.localNotificationActionPerformed({ actionId: 'tap', notification: { extra: { alert: { key: 'k', sourceId: 'e', when: '2026-11-20T10:00' } } } });
    const opened: string[] = [];
    p.onOpenDate((d) => opened.push(d));
    expect(opened).toEqual(['2026-11-20']);
  });

  it('backs up every week to Documents/Bloom, keeps the newest 8 (and other files)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'], now: new Date('2026-11-19T10:00') });
    documentsBlocked = false;
    for (let d = 1; d <= 9; d++) files.set(`DOCUMENTS:Bloom/bloom-backup-2026-10-${String(d).padStart(2, '0')}.json`, '{}');
    files.set('DOCUMENTS:Bloom/my-notes.txt', 'mine');
    const p = await createAndroid(fakeWeb);
    await vi.advanceTimersByTimeAsync(16000);
    const docs = [...files.keys()].filter((k) => k.startsWith('DOCUMENTS:Bloom/bloom-backup-')).sort();
    expect(docs).toHaveLength(8);
    expect(docs.at(-1)).toBe('DOCUMENTS:Bloom/bloom-backup-2026-11-19.json');
    expect(files.has('DOCUMENTS:Bloom/my-notes.txt')).toBe(true);
    expect((await p.autoBackup!.get()).folder).toBe('Documents/Bloom');
    // Not again the same week.
    files.delete('DOCUMENTS:Bloom/bloom-backup-2026-11-19.json');
    await vi.advanceTimersByTimeAsync(3 * 3600000);
    expect(files.has('DOCUMENTS:Bloom/bloom-backup-2026-11-19.json')).toBe(false);
    vi.useRealTimers();
  });

  it("falls back to the app's own folder when Documents can't be written", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'], now: new Date('2026-11-19T10:00') });
    documentsBlocked = true;
    const p = await createAndroid(fakeWeb);
    const st = await p.autoBackup!.run();
    expect(files.has('EXTERNAL:Bloom/bloom-backup-2026-11-19.json')).toBe(true);
    expect(st.folder).toBe('Android/data/app.bloom.calendar/files/Bloom');
    expect(st.error).toBeNull();
    documentsBlocked = false;
    vi.useRealTimers();
  });
});
