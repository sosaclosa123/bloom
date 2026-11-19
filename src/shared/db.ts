// Pure data operations on a Snapshot. Persistence lives in the platform layer
// (a JSON file on Windows, localStorage in the browser, a phone DB later), so
// this logic is shared everywhere.
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type CollectionName,
  type Collections,
  type RecordOf,
  type Settings,
  type Snapshot,
  type SyncMeta,
} from './types';

export const COLLECTIONS: CollectionName[] = ['events', 'days', 'reminders', 'countdowns', 'sounds', 'journal'];

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptySnapshot(deviceId = uuid()): Snapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    deviceId,
    settings: { ...DEFAULT_SETTINGS },
    events: [],
    days: [],
    reminders: [],
    countdowns: [],
    sounds: [],
    journal: [],
  };
}

/** Fills in anything missing from older or partial data. */
export function normalizeSnapshot(raw: unknown): Snapshot {
  const base = emptySnapshot();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Snapshot>;
  const snap: Snapshot = {
    ...base,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : base.deviceId,
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
  };
  for (const c of COLLECTIONS) {
    const list = (r as Record<string, unknown>)[c];
    (snap as unknown as Record<string, unknown>)[c] = Array.isArray(list) ? list : [];
  }
  // v1 -> v2: reminders became private by default when sync arrived, so
  // existing personal reminders don't suddenly show up for a partner.
  if ((r.schemaVersion ?? 1) < 2 && Array.isArray(r.events)) {
    snap.reminders = snap.reminders.map((x) => ({ ...x, visibility: 'private' }));
  }
  return snap;
}

export function newMeta(now = Date.now()): SyncMeta {
  return { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, ownerId: 'local', visibility: 'shared' };
}

export function upsert<C extends CollectionName>(snap: Snapshot, coll: C, item: RecordOf<C>): Snapshot {
  const list = snap[coll] as RecordOf<C>[];
  const idx = list.findIndex((x) => x.id === item.id);
  const prev = idx >= 0 ? list[idx].updatedAt ?? 0 : 0;
  const stamped = { ...item, updatedAt: Math.max(Date.now(), prev + 1) };
  const next = idx >= 0 ? list.map((x, i) => (i === idx ? stamped : x)) : [...list, stamped];
  return { ...snap, [coll]: next };
}

/** Soft delete so the deletion can sync to other devices later. */
export function remove(snap: Snapshot, coll: CollectionName, id: string): Snapshot {
  const list = snap[coll] as SyncMeta[];
  return {
    ...snap,
    [coll]: list.map((x) => {
      if (x.id !== id) return x;
      const now = Math.max(Date.now(), (x.updatedAt ?? 0) + 1);
      return { ...x, deletedAt: now, updatedAt: now };
    }),
  };
}

export function updateSettings(snap: Snapshot, patch: Partial<Settings>): Snapshot {
  return { ...snap, settings: { ...snap.settings, ...patch } };
}

/** Last-write-wins merge, record by record. Used for backup import now, sync later. */
export function merge(local: Snapshot, incoming: Snapshot): Snapshot {
  const out: Snapshot = { ...local };
  for (const c of COLLECTIONS) {
    const map = new Map<string, SyncMeta>();
    for (const x of local[c] as SyncMeta[]) map.set(x.id, x);
    for (const x of incoming[c] as SyncMeta[]) {
      const cur = map.get(x.id);
      const a = x.updatedAt ?? 0;
      const b = cur?.updatedAt ?? 0;
      // Newest wins; on an exact tie a live copy beats a tombstone (a record
      // that moved between private/shared leaves a same-time tombstone behind).
      if (!cur || a > b || (a === b && cur.deletedAt && !x.deletedAt)) map.set(x.id, x);
    }
    (out as unknown as Collections)[c] = [...map.values()] as never;
  }
  return out;
}

/** Removes tombstones older than `maxAgeDays` to keep the file small. */
export function compact(snap: Snapshot, maxAgeDays = 90): Snapshot {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const out: Snapshot = { ...snap };
  for (const c of COLLECTIONS) {
    (out as unknown as Collections)[c] = (snap[c] as SyncMeta[]).filter(
      (x) => !x.deletedAt || x.deletedAt > cutoff,
    ) as never;
  }
  return out;
}

export function alive<T extends SyncMeta>(list: T[]): T[] {
  return list.filter((x) => !x.deletedAt);
}
