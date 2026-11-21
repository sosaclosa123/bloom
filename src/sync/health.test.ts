// Health records are always private: they only ever go to the person's own
// area online, never to the shared couple calendar, whatever they say.
import { describe, expect, it } from 'vitest';
import { emptySnapshot, merge, newMeta, normalizeSnapshot, upsert } from '../shared/db';
import type { Collections, HealthCheckin, HealthItem, Snapshot } from '../shared/types';
import { FakeBackend, FakeCloud } from './fakeBackend';
import { partialToSnapshot, SyncEngine, type LocalPort } from './engine';

class Device {
  snap: Snapshot = emptySnapshot();
  store = new Map<string, string>();
  listeners = new Set<(s: Snapshot) => void>();
  engine: SyncEngine;
  backend: FakeBackend;
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
    this.backend = new FakeBackend(cloud);
    this.engine = new SyncEngine(this.backend, port, { pushDelay: 5 });
    this.engine.start();
  }
  set(s: Snapshot) {
    this.snap = s;
    this.listeners.forEach((l) => l(s));
  }
  health(id: string) {
    return this.snap.health.find((h) => h.id === id);
  }
}

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function checkin(extra: Partial<HealthCheckin> = {}): HealthCheckin {
  return { ...newMeta(), kind: 'checkin', date: '2026-11-21', waterMl: 750, mood: 4, sleepH: 7, energy: 3, stress: 2, ...extra };
}

/** Every health record anywhere in the cloud's shared calendars. */
function healthInSpaces(cloud: FakeCloud) {
  const out: unknown[] = [];
  for (const [k, m] of cloud.items) if (k.startsWith('s:')) for (const it of m.values()) if (it.coll === 'health') out.push(it);
  return out;
}

describe('health is always private', () => {
  it('goes only to the own user area, even when marked shared, and never reaches the partner', async () => {
    const cloud = new FakeCloud();
    const me = new Device(cloud);
    const partner = new Device(cloud);
    await me.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    await wait();
    const code = await me.engine.createSpace();
    await partner.engine.signUp('Noa', 'noa@example.com', 'pw123456');
    await wait();
    await partner.engine.joinSpace(code);
    await wait(120);

    // A health record that (wrongly) says 'shared' is pushed straight into the snapshot.
    const rec = { ...checkin(), visibility: 'shared' } as HealthItem;
    me.set({ ...me.snap, health: [...me.snap.health, rec] });
    await wait(150);

    expect(healthInSpaces(cloud)).toHaveLength(0);
    const uid = me.engine.get().user!.uid;
    expect(cloud.items.get(`u:${uid}`)?.has(`health_${rec.id}`)).toBe(true);
    expect(partner.health(rec.id)).toBeUndefined();
    expect(me.engine.scopeFor('health', rec)).toEqual({ kind: 'user', uid });

    // My second device gets it (same person, own area).
    const laptop = new Device(cloud);
    await laptop.engine.signIn('ido@example.com', 'pw123456');
    await wait(200);
    expect(laptop.health(rec.id)?.kind).toBe('checkin');
    expect(laptop.health(rec.id)?.visibility).toBe('private');
  });

  it('ignores a health record found in a shared calendar', async () => {
    const cloud = new FakeCloud();
    const me = new Device(cloud);
    const partner = new Device(cloud);
    await me.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    await wait();
    const code = await me.engine.createSpace();
    await partner.engine.signUp('Noa', 'noa@example.com', 'pw123456');
    await wait();
    await partner.engine.joinSpace(code);
    await wait(120);

    // Something put a health record into the shared calendar directly.
    const rec = { ...checkin(), visibility: 'shared' } as HealthItem;
    await me.backend.put({ kind: 'space', sid: code }, [{ coll: 'health', id: rec.id, updatedAt: rec.updatedAt, data: rec as unknown as Record<string, unknown> }]);
    await wait(150);
    expect(partner.health(rec.id)).toBeUndefined();
    expect(me.health(rec.id)).toBeUndefined();
  });

  it('forces private on save, load and merge', () => {
    const shared = { ...checkin(), visibility: 'shared' } as HealthItem;
    expect(upsert(emptySnapshot(), 'health', shared).health[0].visibility).toBe('private');
    expect(normalizeSnapshot({ ...emptySnapshot(), health: [shared] }).health[0].visibility).toBe('private');
    expect(merge(emptySnapshot(), { ...emptySnapshot(), health: [shared] }).health[0].visibility).toBe('private');
    // Older data without a health list still loads.
    const old = { ...emptySnapshot(), schemaVersion: 4 } as Partial<Snapshot>;
    delete old.health;
    expect(normalizeSnapshot(old).health).toEqual([]);
  });
});
