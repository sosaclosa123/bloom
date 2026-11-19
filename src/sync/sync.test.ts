import { describe, expect, it } from 'vitest';
import { emptySnapshot, merge, newMeta, remove, upsert } from '../shared/db';
import type { CalendarEvent, Collections, JournalEntry, Reminder, Snapshot } from '../shared/types';
import { FakeBackend, FakeCloud } from './fakeBackend';
import { partialToSnapshot, SyncEngine, type LocalPort } from './engine';

/** One device: its own local data + its own engine. */
class Device {
  snap: Snapshot = emptySnapshot();
  photos = new Map<string, string>();
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
      readPhoto: async (f) => this.photos.get(f) ?? null,
      hasPhoto: async (f) => this.photos.has(f),
      writePhoto: async (f, d) => void this.photos.set(f, d),
      getItem: (k) => this.store.get(k) ?? null,
      setItem: (k, v) => void this.store.set(k, v),
    };
    this.engine = new SyncEngine(new FakeBackend(cloud), port, { pushDelay: 5 });
    this.engine.start();
  }
  set(s: Snapshot) {
    this.snap = s;
    this.listeners.forEach((l) => l(s));
  }
  event(id: string) {
    return this.snap.events.find((e) => e.id === id);
  }
}

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function ev(title: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return { ...newMeta(), title, allDay: false, start: '2026-11-20T20:00', end: '2026-11-20T21:00', color: 'rose', notes: '', location: '', repeat: 'none', remindBefore: [], sound: 'builtin:chime', ...extra };
}

describe('sync between two partners', () => {
  it('shares, keeps private things private, moves, deletes and syncs photos', async () => {
    const cloud = new FakeCloud();
    const her = new Device(cloud);
    const him = new Device(cloud);

    await her.engine.signUp('Noa', 'noa@example.com', 'pw123456');
    await wait();
    // She already had an event before signing up.
    const dinner = ev('Dinner');
    her.set(upsert(her.snap, 'events', dinner));
    const code = await her.engine.createSpace();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    await him.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    await wait();
    await him.engine.joinSpace(code.slice(0, 4) + '-' + code.slice(4).toLowerCase());
    await wait(120);
    expect(him.event(dinner.id)?.title).toBe('Dinner');
    expect(her.engine.get().space?.members).toHaveLength(2);

    // He edits it -> she sees the change.
    him.set(upsert(him.snap, 'events', { ...him.event(dinner.id)!, title: 'Dinner at 8' }));
    await wait(120);
    expect(her.event(dinner.id)?.title).toBe('Dinner at 8');

    // Her private reminder never reaches him.
    const pills: Reminder = { ...newMeta(), visibility: 'private', title: 'Pills', at: '2026-11-20T09:00', repeat: 'daily', sound: 's', note: '' };
    her.set(upsert(her.snap, 'reminders', pills));
    await wait(120);
    expect(him.snap.reminders.find((r) => r.id === pills.id)).toBeUndefined();

    // Shared -> private: disappears for him, stays for her.
    her.set(upsert(her.snap, 'events', { ...her.event(dinner.id)!, visibility: 'private' }));
    await wait(150);
    expect(him.event(dinner.id)?.deletedAt).toBeTruthy();
    expect(her.event(dinner.id)?.deletedAt).toBeFalsy();

    // Her second device (e.g. a new PC) gets her private things too, not as deleted.
    const herLaptop = new Device(cloud);
    await herLaptop.engine.signIn('noa@example.com', 'pw123456');
    await wait(200);
    expect(herLaptop.snap.reminders.find((r) => r.id === pills.id)?.title).toBe('Pills');
    expect(herLaptop.event(dinner.id)?.deletedAt).toBeFalsy();

    // Deleting a shared item reaches the partner.
    const movie = ev('Movie');
    him.set(upsert(him.snap, 'events', movie));
    await wait(120);
    expect(her.event(movie.id)?.title).toBe('Movie');
    her.set(remove(her.snap, 'events', movie.id));
    await wait(120);
    expect(him.event(movie.id)?.deletedAt).toBeTruthy();

    // A shared journal entry brings its photo along.
    her.photos.set('p1.jpg', 'data:image/jpeg;base64,AAAA');
    const entry: JournalEntry = { ...newMeta(), visibility: 'shared', date: '2026-11-20', text: 'Beach day', photos: [{ id: 'p1', fileName: 'p1.jpg', name: 'beach.jpg' }] };
    her.set(upsert(her.snap, 'journal', entry));
    await wait(150);
    expect(him.snap.journal.find((j) => j.id === entry.id)?.text).toBe('Beach day');
    expect(him.photos.get('p1.jpg')).toBe('data:image/jpeg;base64,AAAA');

    // A third person can't join.
    const stranger = new Device(cloud);
    await stranger.engine.signUp('X', 'x@example.com', 'pw123456');
    await wait();
    await expect(stranger.engine.joinSpace(code)).rejects.toThrow('full');

    // No endless echo: nothing left to push.
    const before = cloud.items.get(`s:${code}`)!.size;
    await wait(120);
    expect(cloud.items.get(`s:${code}`)!.size).toBe(before);
    expect(her.engine.get().status).toBe('synced');
  });
});
