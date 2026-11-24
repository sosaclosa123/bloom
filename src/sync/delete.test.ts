// Owner's bug report (Nov 2026): a meal added and then deleted still showed.
// Deletions must reach every device of the account, both ways.
import { describe, expect, it } from 'vitest';
import { alive, emptySnapshot, merge, newMeta, remove, upsert } from '../shared/db';
import type { Collections, HealthFood, HealthRecipe, Snapshot } from '../shared/types';
import { FakeBackend, FakeCloud } from './fakeBackend';
import { partialToSnapshot, SyncEngine, type LocalPort } from './engine';

class Device {
  snap: Snapshot = emptySnapshot();
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
    };
    this.engine = new SyncEngine(new FakeBackend(cloud), port, { pushDelay: 5 });
    this.engine.start();
  }
  set(s: Snapshot) {
    this.snap = s;
    this.listeners.forEach((l) => l(s));
  }
  liveHealth() {
    return alive(this.snap.health).map((h) => h.id);
  }
}
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const food = (): HealthFood => ({ ...newMeta(), visibility: 'private', kind: 'food', date: '2026-11-24', time: '12:00', meal: 'lunch', text: 'Rice bowl', tags: [], grams: 250, kcal: 378, protein: 49 });
const meal = (): HealthRecipe => ({ ...newMeta(), visibility: 'private', kind: 'recipe', name: 'Rice bowl', label: 'healthy', items: [] });

describe('deleting syncs to the other device', () => {
  for (const [what, make] of [['a food line', food], ['a saved meal', meal]] as const) {
    it(`${what}: added on the phone, deleted on the phone -> gone on the PC`, async () => {
      const cloud = new FakeCloud();
      const pc = new Device(cloud);
      await pc.engine.signUp('Ido', 'ido@example.com', 'pw123456');
      const phone = new Device(cloud);
      await phone.engine.signIn('ido@example.com', 'pw123456');
      await wait();
      const x = make();
      phone.set(upsert(phone.snap, 'health', x));
      await wait();
      expect(pc.liveHealth()).toContain(x.id);
      phone.set(remove(phone.snap, 'health', x.id));
      await wait();
      expect(phone.liveHealth()).not.toContain(x.id);
      expect(pc.liveHealth()).not.toContain(x.id);
    });
    it(`${what}: added on the PC, deleted on the phone right away -> gone on both`, async () => {
      const cloud = new FakeCloud();
      const pc = new Device(cloud);
      await pc.engine.signUp('Ido', 'ido@example.com', 'pw123456');
      const phone = new Device(cloud);
      await phone.engine.signIn('ido@example.com', 'pw123456');
      await wait();
      const x = make();
      pc.set(upsert(pc.snap, 'health', x));
      await wait();
      phone.set(remove(phone.snap, 'health', x.id));
      await wait(200);
      expect(phone.liveHealth()).not.toContain(x.id);
      expect(pc.liveHealth()).not.toContain(x.id);
    });
  }
});

describe('coming back from the background', () => {
  it('refresh() picks up a deletion made elsewhere while this device was not listening', async () => {
    const cloud = new FakeCloud();
    const pc = new Device(cloud);
    await pc.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    const phone = new Device(cloud);
    await phone.engine.signIn('ido@example.com', 'pw123456');
    await wait();
    const x = food();
    pc.set(upsert(pc.snap, 'health', x));
    await wait();
    expect(phone.liveHealth()).toContain(x.id);
    // The phone stops hearing changes (background), the PC deletes, the phone comes back.
    (phone.engine as unknown as { stopScopes(): void }).stopScopes();
    pc.set(remove(pc.snap, 'health', x.id));
    await wait();
    expect(phone.liveHealth()).toContain(x.id);
    phone.engine.refresh();
    await wait();
    expect(phone.liveHealth()).not.toContain(x.id);
  });
});
