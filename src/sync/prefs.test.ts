// Account settings follow the person to every PC and phone (owner's request, Nov 2026).
import { describe, expect, it } from 'vitest';
import { emptySnapshot, merge, updateSettings } from '../shared/db';
import type { Collections, Settings, Snapshot } from '../shared/types';
import { FakeBackend, FakeCloud } from './fakeBackend';
import { partialToSnapshot, SyncEngine, type LocalPort } from './engine';

class Device {
  snap: Snapshot = emptySnapshot();
  store = new Map<string, string>();
  listeners = new Set<(s: Snapshot) => void>();
  engine: SyncEngine;
  constructor(cloud: FakeCloud, weight: number, settings: Partial<Settings> = {}) {
    this.snap = updateSettings(this.snap, settings);
    const port: LocalPort = {
      snapshot: () => this.snap,
      onChange: (cb) => {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
      },
      applyRemote: async (c: Partial<Collections>) => this.set(merge(this.snap, partialToSnapshot(this.snap, c))),
      applySettings: async (p) => this.set(updateSettings(this.snap, p)),
      readPhoto: async () => null,
      hasPhoto: async () => false,
      writePhoto: async () => {},
      getItem: (k) => this.store.get(k) ?? null,
      setItem: (k, v) => void this.store.set(k, v),
    };
    this.engine = new SyncEngine(new FakeBackend(cloud), port, { pushDelay: 5, prefsFirstWeight: weight });
    this.engine.start();
  }
  set(s: Snapshot) {
    this.snap = s;
    this.listeners.forEach((l) => l(s));
  }
  change(p: Partial<Settings>) {
    this.set(updateSettings(this.snap, p));
  }
}

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const PC = 2;
const PHONE = 1;

describe('account settings', () => {
  it('a new phone gets the PC settings (Hebrew, Health on), never the other way round', async () => {
    const cloud = new FakeCloud();
    const pc = new Device(cloud, PC, { language: 'he', healthEnabled: true, healthIbd: true, fontSize: 'large', volume: 0.3 });
    await pc.engine.signUp('Noa', 'noa@example.com', 'pw123456');
    await wait();
    const phone = new Device(cloud, PHONE);
    await phone.engine.signIn('noa@example.com', 'pw123456');
    await wait();
    expect(phone.snap.settings.language).toBe('he');
    expect(phone.snap.settings.healthEnabled).toBe(true);
    expect(phone.snap.settings.healthIbd).toBe(true);
    // Per-device settings stay as they were on the phone.
    expect(phone.snap.settings.fontSize).toBe('medium');
    expect(phone.snap.settings.volume).toBe(0.8);
    // The PC kept its own.
    expect(pc.snap.settings.language).toBe('he');
    expect(pc.snap.settings.healthEnabled).toBe(true);
  });

  it('phone installed before the PC updated: the PC settings still win, except what was changed on purpose', async () => {
    const cloud = new FakeCloud();
    const phone = new Device(cloud, PHONE);
    await phone.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    await wait();
    phone.change({ currency: 'USD' }); // a real change on the phone
    await wait();
    const pc = new Device(cloud, PC, { language: 'he', healthEnabled: true });
    await pc.engine.signIn('ido@example.com', 'pw123456');
    await wait();
    expect(pc.snap.settings.language).toBe('he');
    expect(pc.snap.settings.healthEnabled).toBe(true);
    expect(pc.snap.settings.currency).toBe('USD');
    expect(phone.snap.settings.language).toBe('he');
    expect(phone.snap.settings.healthEnabled).toBe(true);
  });

  it('a change on one device shows on the other, live', async () => {
    const cloud = new FakeCloud();
    const pc = new Device(cloud, PC);
    await pc.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    const phone = new Device(cloud, PHONE);
    await phone.engine.signIn('ido@example.com', 'pw123456');
    await wait();
    phone.change({ healthEnabled: true, healthWaterNudge: true, theme: 'dark' });
    await wait();
    expect(pc.snap.settings.healthEnabled).toBe(true);
    expect(pc.snap.settings.healthWaterNudge).toBe(true);
    expect(pc.snap.settings.theme).toBe('dark');
    pc.change({ language: 'he', fontSize: 'small' });
    await wait();
    expect(phone.snap.settings.language).toBe('he');
    expect(phone.snap.settings.fontSize).toBe('medium'); // text size is per device
    expect(phone.snap.settings.theme).toBe('dark');
  });

  it("partners' settings never mix", async () => {
    const cloud = new FakeCloud();
    const her = new Device(cloud, PC, { language: 'he' });
    await her.engine.signUp('Noa', 'noa@example.com', 'pw123456');
    await wait();
    const code = await her.engine.createSpace();
    const him = new Device(cloud, PC, { language: 'en', healthEnabled: true });
    await him.engine.signUp('Ido', 'ido@example.com', 'pw123456');
    await wait();
    await him.engine.joinSpace(code);
    await wait();
    expect(her.snap.settings.language).toBe('he');
    expect(her.snap.settings.healthEnabled).toBe(false);
    expect(him.snap.settings.language).toBe('en');
  });
});
