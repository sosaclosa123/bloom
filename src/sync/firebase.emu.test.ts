// The real sync code against the real Firestore + Auth emulator (with our
// security rules): catches anything the in-memory stand-in can't, like the
// "only what changed" query and server save times.
// Runs only with the emulator: qa/sync-emulator.sh
import { afterAll, describe, expect, it } from 'vitest';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { alive, emptySnapshot, merge, newMeta, remove, upsert } from '../shared/db';
import type { CalendarEvent, Collections, Snapshot } from '../shared/types';
import { partialToSnapshot, SyncEngine, type LocalPort } from './engine';
import { createFirebaseBackend } from './firebase';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const run = HOST ? describe : describe.skip;
const config = { projectId: 'demo-bloom', apiKey: 'demo-key', authDomain: 'demo-bloom.firebaseapp.com' };
let n = 0;
const devices: Device[] = [];
afterAll(() => devices.forEach((d) => d.engine.stop()));

class Device {
  snap: Snapshot = emptySnapshot();
  listeners = new Set<(s: Snapshot) => void>();
  engine: SyncEngine;
  name = `device${++n}`;
  constructor(public store = new Map<string, string>()) {
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
    };
    const [host, port2] = HOST!.split(':');
    const backend = createFirebaseBackend(config, { name: this.name, host, firestorePort: Number(port2), authPort: Number(process.env.AUTH_PORT || 9099) });
    this.engine = new SyncEngine(backend, port, { pushDelay: 20, relistenMs: [200] });
    this.engine.start();
    devices.push(this);
  }
  set(s: Snapshot) {
    this.snap = s;
    this.listeners.forEach((l) => l(s));
  }
  titles() {
    return alive(this.snap.events)
      .map((e) => e.title)
      .sort();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(50);
  }
}
const event = (title: string, visibility: 'private' | 'shared' = 'private'): CalendarEvent => ({
  ...newMeta(),
  visibility,
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

async function account() {
  const email = `u${Date.now()}${n}@example.com`;
  const pc = new Device();
  await pc.engine.signUp('Ido', email, 'pw123456');
  await until(() => pc.engine.get().status === 'synced');
  const phone = new Device();
  await phone.engine.signIn(email, 'pw123456');
  await until(() => phone.engine.get().status === 'synced');
  return { email, pc, phone };
}

run('sync on real Firestore (emulator)', () => {
  it('phone -> PC and PC -> phone, then a deletion', async () => {
    const { pc, phone } = await account();
    const e = event('Dentist (phone)');
    phone.set(upsert(phone.snap, 'events', e));
    await until(() => pc.titles().includes('Dentist (phone)'));
    pc.set(upsert(pc.snap, 'events', event('Work (PC)')));
    await until(() => phone.titles().includes('Work (PC)'));
    phone.set(remove(phone.snap, 'events', e.id));
    await until(() => !pc.titles().includes('Dentist (phone)'));
    expect(pc.titles()).toEqual(['Work (PC)']);
  });

  it('after "coming back" it only listens for changes, and still gets them', async () => {
    const { pc, phone } = await account();
    for (let i = 0; i < 20; i++) pc.set(upsert(pc.snap, 'events', event(`Event ${i}`)));
    await until(() => phone.titles().length === 20);
    await sleep(300);
    phone.engine.refresh();
    await sleep(500);
    pc.set(upsert(pc.snap, 'events', event('After coming back')));
    await until(() => phone.titles().includes('After coming back'));
    expect(phone.titles()).toHaveLength(21);
    // Listening "from here" really filters: an item saved with no server time
    // (older app version) isn't sent again until a full download.
    const uid = phone.engine.get().user!.uid;
    const old = event('Saved by an older version');
    await setDoc(doc(getFirestore(getApp(phone.name)), 'users', uid, 'items', `events_${old.id}`), { coll: 'events', id: old.id, updatedAt: old.updatedAt, data: old });
    phone.engine.refresh();
    await sleep(800);
    expect(phone.titles()).not.toContain('Saved by an older version');
    phone.engine.refresh(true);
    await until(() => phone.titles().includes('Saved by an older version'));
  });

  it('a restarted app gets what changed while it was closed', async () => {
    const { email, pc, phone } = await account();
    pc.set(upsert(pc.snap, 'events', event('Before')));
    await until(() => phone.titles().includes('Before'));
    await sleep(300);
    phone.engine.stop();
    pc.set(upsert(pc.snap, 'events', event('While closed')));
    await sleep(500);
    const again = new Device(phone.store);
    again.snap = phone.snap;
    await again.engine.signIn(email, 'pw123456');
    await until(() => again.titles().includes('While closed'));
    expect(again.titles()).toEqual(['Before', 'While closed']);
  });

  it('shared calendar between two people (security rules)', async () => {
    const a = new Device();
    await a.engine.signUp('Ido', `a${Date.now()}@example.com`, 'pw123456');
    await until(() => a.engine.get().status === 'synced');
    const code = await a.engine.createSpace();
    const b = new Device();
    await b.engine.signUp('Her', `b${Date.now()}@example.com`, 'pw123456');
    await until(() => b.engine.get().status === 'synced');
    await b.engine.joinSpace(code);
    b.set(upsert(b.snap, 'events', event('Dinner together', 'shared')));
    b.set(upsert(b.snap, 'events', event('Her private thing')));
    await until(() => a.titles().includes('Dinner together'));
    await sleep(500);
    expect(a.titles()).toEqual(['Dinner together']);
  });

  it('shared food library: anyone signed in can add and vote by one; the rules refuse more', async () => {
    const a = new Device();
    await a.engine.signUp('A', `la${Date.now()}@example.com`, 'pw123456');
    await until(() => a.engine.get().status === 'synced');
    const b = new Device();
    await b.engine.signUp('B', `lb${Date.now()}@example.com`, 'pw123456');
    await until(() => b.engine.get().status === 'synced');
    const key = `my:test${Date.now()}`;
    await a.engine.libraryPut({ key, name: 'Protein pudding', brand: 'Danone', per100: { kcal: 70, protein: 10, fat: 1.5, carbs: 4.5 } });
    await a.engine.libraryVote(key, 'Protein pudding', 1, 0);
    await b.engine.libraryVote(key, 'Protein pudding', 1, 0);
    const seen = (await b.engine.libraryFetch(0)).find((x) => x.key === key)!;
    expect(seen).toMatchObject({ name: 'Protein pudding', up: 2, down: 0 });
    expect(seen.per100?.kcal).toBe(70);
    // Only changes since a time come back the second time.
    expect((await b.engine.libraryFetch(seen.updatedAt)).some((x) => x.key === key)).toBe(false);
    // The rules: a vote can't jump by 2, and nothing else can be stored.
    const db = getFirestore(getApp(b.name));
    const { increment, serverTimestamp } = await import('firebase/firestore');
    const id = key.replace(/[^A-Za-z0-9_-]/g, '_');
    await expect(setDoc(doc(db, 'library', id), { key, name: 'x', up: increment(2), updatedAt: serverTimestamp() }, { merge: true })).rejects.toThrow();
    await expect(setDoc(doc(db, 'library', id), { key, name: 'x', who: 'me', updatedAt: serverTimestamp() }, { merge: true })).rejects.toThrow();
  });
});
