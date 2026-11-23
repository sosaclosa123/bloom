// Account data follows the account: it shows on every computer you sign in
// to, and signing out hides it (back to that computer's offline data).
import { describe, expect, it } from 'vitest';
import { emptySnapshot, merge, newMeta, upsert } from '../shared/db';
import type { CalendarEvent, Collections, HealthCheckin, Snapshot } from '../shared/types';
import { FakeBackend, FakeCloud } from './fakeBackend';
import { partialToSnapshot, SyncEngine, type LocalPort } from './engine';

/** A computer with profiles like the real app: offline data + one copy per account. */
class Computer {
  files = new Map<string, Snapshot>([['local', emptySnapshot()]]);
  active = 'local';
  store = new Map<string, string>();
  listeners = new Set<(s: Snapshot) => void>();
  engine: SyncEngine;
  constructor(cloud: FakeCloud) {
    const port: LocalPort = {
      snapshot: () => this.snap,
      onChange: (cb) => {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
      },
      applyRemote: async (c: Partial<Collections>) => this.set(merge(this.snap, partialToSnapshot(this.snap, c))),
      readPhoto: async () => null,
      hasPhoto: async () => false,
      writePhoto: async () => {},
      getItem: (k) => this.store.get(k) ?? null,
      setItem: (k, v) => void this.store.set(k, v),
      switchProfile: async (uid, forget) => {
        this.active = uid ?? 'local';
        if (!this.files.has(this.active)) this.files.set(this.active, emptySnapshot());
        if (forget) this.files.delete(forget);
        this.listeners.forEach((l) => l(this.snap));
      },
    };
    this.engine = new SyncEngine(new FakeBackend(cloud), port, { pushDelay: 5 });
    this.engine.start();
  }
  get snap() {
    return this.files.get(this.active)!;
  }
  set(s: Snapshot) {
    this.files.set(this.active, s);
    this.listeners.forEach((l) => l(s));
  }
  titles() {
    return this.snap.events.filter((e) => !e.deletedAt).map((e) => e.title);
  }
}

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const ev = (title: string): CalendarEvent => ({ ...newMeta(), title, allDay: true, start: '2026-11-20T00:00', end: '2026-11-20T23:59', color: 'rose', notes: '', location: '', repeat: 'none', remindBefore: [], sound: 's' });

describe('account data follows the account', () => {
  it('shows on every computer, hides on sign-out, comes back on sign-in', async () => {
    const cloud = new FakeCloud();
    const pc = new Computer(cloud);
    pc.set(upsert(pc.snap, 'events', ev('Offline only')));

    await pc.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    await wait();
    expect(pc.titles()).toEqual([]); // the account starts with its own (empty) data
    pc.set(upsert(pc.snap, 'events', ev('In my account')));
    const water: HealthCheckin = { ...newMeta(), kind: 'checkin', date: '2026-11-20', waterMl: 500, mood: 4, sleepH: 7, energy: 3, stress: 2 };
    pc.set(upsert(pc.snap, 'health', water));
    await wait(150);

    // Another computer: same account -> same things (Health too).
    const laptop = new Computer(cloud);
    await laptop.engine.signIn('ido@example.com', 'pw123456');
    await wait(200);
    expect(laptop.titles()).toEqual(['In my account']);
    expect(laptop.snap.health.map((h) => h.id)).toEqual([water.id]);

    // Sign out: everything uploaded first, then back to the offline data; the account copy is gone.
    expect(await pc.engine.flush()).toBe(0);
    await pc.engine.signOut();
    await wait();
    expect(pc.titles()).toEqual(['Offline only']);
    expect(pc.files.has(pc.engine.get().user?.uid ?? 'uid1')).toBe(false);

    // Sign in again: the account's things come back from online.
    await pc.engine.signIn('ido@example.com', 'pw123456');
    await wait(200);
    expect(pc.titles()).toEqual(['In my account']);
    expect(pc.snap.health).toHaveLength(1);
  });

  it('counts changes that are not online yet', async () => {
    const cloud = new FakeCloud();
    const pc = new Computer(cloud);
    await pc.engine.signUp('Noa', 'noa@example.com', 'pw123456');
    await wait();
    pc.set(upsert(pc.snap, 'events', ev('New')));
    expect(pc.engine.unsyncedCount()).toBe(1);
    expect(await pc.engine.flush()).toBe(0);
  });
});
