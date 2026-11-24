// Owner's bug report (Nov 2026): things added on the phone never showed on the
// PC, even hours later. Sync must keep working through everything a real
// phone and a PC left on for days run into.
import { afterEach, describe, expect, it } from 'vitest';
import { alive, emptySnapshot, merge, newMeta, upsert } from '../shared/db';
import type { CalendarEvent, Collections, JournalEntry, Snapshot } from '../shared/types';
import { FakeBackend, FakeCloud } from './fakeBackend';
import { partialToSnapshot, SyncEngine, type LocalPort } from './engine';

const devices: Device[] = [];
afterEach(() => {
  devices.splice(0).forEach((d) => d.engine.stop());
});

class Device {
  snap: Snapshot = emptySnapshot();
  listeners = new Set<(s: Snapshot) => void>();
  photos = new Map<string, string>();
  failPhotos = false;
  engine: SyncEngine;
  backend: FakeBackend;
  /** `store` = this device's saved sync notes (kept when the app restarts). */
  constructor(
    cloud: FakeCloud,
    public store = new Map<string, string>(),
  ) {
    const port: LocalPort = {
      snapshot: () => this.snap,
      onChange: (cb) => {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
      },
      applyRemote: async (c: Partial<Collections>) => this.set(merge(this.snap, partialToSnapshot(this.snap, c))),
      readPhoto: async (f) => {
        if (this.failPhotos) throw new Error('unavailable');
        return this.photos.get(f) ?? null;
      },
      hasPhoto: async (f) => this.photos.has(f),
      writePhoto: async (f, d) => void this.photos.set(f, d),
      getItem: (k) => this.store.get(k) ?? null,
      setItem: (k, v) => void this.store.set(k, v),
    };
    this.backend = new FakeBackend(cloud);
    this.engine = new SyncEngine(this.backend, port, { pushDelay: 5, relistenMs: [20] });
    this.engine.start();
    devices.push(this);
  }
  set(s: Snapshot) {
    this.snap = s;
    this.listeners.forEach((l) => l(s));
  }
  add(e: CalendarEvent) {
    this.set(upsert(this.snap, 'events', e));
  }
  titles() {
    return alive(this.snap.events)
      .map((e) => e.title)
      .sort();
  }
}

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const event = (title: string): CalendarEvent => ({
  ...newMeta(),
  visibility: 'private',
  title,
  allDay: false,
  start: '2026-11-25T10:00',
  end: '2026-11-25T11:00',
  color: 'sky',
  notes: '',
  location: '',
  repeat: 'none',
  remindBefore: [],
  sound: 'builtin:chime',
});

async function pcAndPhone() {
  const cloud = new FakeCloud();
  const pc = new Device(cloud);
  await pc.engine.signUp('Ido', 'ido@example.com', 'pw123456');
  const phone = new Device(cloud);
  await phone.engine.signIn('ido@example.com', 'pw123456');
  await wait();
  return { cloud, pc, phone };
}

describe('sync keeps working', () => {
  it('a calendar event added on the phone shows on the PC, and the other way', async () => {
    const { pc, phone } = await pcAndPhone();
    phone.add(event('Dentist (phone)'));
    pc.add(event('Work (PC)'));
    await wait();
    expect(pc.titles()).toEqual(['Dentist (phone)', 'Work (PC)']);
    expect(phone.titles()).toEqual(['Dentist (phone)', 'Work (PC)']);
  });

  it('listens again by itself after the live feed stops (quota, expired sign-in…)', async () => {
    const { cloud, pc, phone } = await pcAndPhone();
    cloud.breakFeeds();
    await wait(10);
    expect(pc.engine.get().status).toBe('error');
    phone.add(event('Added after the feed stopped'));
    await wait(150);
    expect(pc.titles()).toEqual(['Added after the feed stopped']);
    expect(pc.engine.get().status).toBe('synced');
  });

  it('coming back to the app downloads only what changed, not everything again', async () => {
    const { cloud, pc, phone } = await pcAndPhone();
    for (let i = 0; i < 50; i++) pc.add(event(`Event ${i}`));
    await wait();
    expect(phone.titles()).toHaveLength(50);
    const before = cloud.reads;
    phone.engine.refresh();
    await wait();
    expect(cloud.reads - before).toBeLessThanOrEqual(2); // one per area, nothing re-downloaded
    pc.add(event('One more'));
    await wait();
    expect(phone.titles()).toHaveLength(51);
  });

  it('a restarted app picks up where it left off (and still gets everything)', async () => {
    const { cloud, pc, phone } = await pcAndPhone();
    for (let i = 0; i < 30; i++) pc.add(event(`Event ${i}`));
    await wait();
    const kept = phone.snap;
    phone.engine.stop();
    pc.add(event('While the phone app was closed'));
    await wait();
    const before = cloud.reads;
    const again = new Device(cloud, phone.store);
    again.snap = kept;
    await again.engine.signIn('ido@example.com', 'pw123456');
    await wait();
    expect(again.titles()).toHaveLength(31);
    expect(again.titles()).toContain('While the phone app was closed');
    expect(cloud.reads - before).toBeLessThanOrEqual(3);
  });

  it('a change that was never sent (app closed too soon) is sent on the next start', async () => {
    const { cloud, pc, phone } = await pcAndPhone();
    phone.engine.stop(); // the app is stopped before it could send
    phone.add(event('Made just before closing'));
    await wait();
    expect(pc.titles()).toEqual([]);
    const again = new Device(cloud, phone.store);
    again.snap = phone.snap;
    await again.engine.signIn('ido@example.com', 'pw123456');
    await wait(150);
    expect(pc.titles()).toEqual(['Made just before closing']);
  });

  it('one record the server refuses never blocks the others', async () => {
    const { cloud, pc, phone } = await pcAndPhone();
    const bad = event('Broken');
    cloud.badIds.add(bad.id);
    phone.add(bad);
    phone.add(event('Fine 1'));
    phone.add(event('Fine 2'));
    await wait(150);
    expect(pc.titles()).toEqual(['Fine 1', 'Fine 2']);
    expect(phone.engine.get().error).toContain('refused');
  });

  it("a photo that can't be sent only holds back its own entry", async () => {
    const { pc, phone } = await pcAndPhone();
    const entry: JournalEntry = { ...newMeta(), visibility: 'private', date: '2026-11-25', text: 'With photo', photos: [{ id: 'p1', fileName: 'p1.jpg', name: 'p1.jpg' }] } as JournalEntry;
    phone.photos.set('p1.jpg', 'data:image/jpeg;base64,AAAA');
    phone.failPhotos = true;
    phone.set(upsert(phone.snap, 'journal', entry));
    phone.add(event('Not held back'));
    await wait();
    expect(pc.titles()).toEqual(['Not held back']);
    expect(alive(pc.snap.journal)).toHaveLength(0);
    phone.failPhotos = false;
    phone.engine.syncNow();
    await wait();
    expect(alive(pc.snap.journal).map((j) => j.text)).toEqual(['With photo']);
    expect(pc.photos.get('p1.jpg')).toBe('data:image/jpeg;base64,AAAA');
  });

  it('"Sync now" downloads everything again (catches items an older app version saved)', async () => {
    const { cloud, pc, phone } = await pcAndPhone();
    phone.add(event('New'));
    await wait();
    // Saved by an older app version: no server time on it.
    const old = event('From the old version');
    const k = `u:${[...cloud.users.values()][0].uid}`;
    cloud.items.get(k)!.set(`events_${old.id}`, { coll: 'events', id: old.id, updatedAt: old.updatedAt, data: old as never });
    pc.engine.refresh(); // what changed: the old one has no time, so not seen yet
    await wait();
    expect(pc.titles()).toEqual(['New']);
    pc.engine.refresh(true);
    await wait();
    expect(pc.titles()).toEqual(['From the old version', 'New']);
  });
});
