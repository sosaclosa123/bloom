// Pure data operations on a Snapshot. Persistence lives in the platform layer
// (a JSON file on Windows, localStorage in the browser, a phone DB later), so
// this logic is shared everywhere.
import { migrateMoneyToV4 } from './money';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type CollectionName,
  type DayEntry,
  type Collections,
  type HealthItem,
  type RecordOf,
  type Settings,
  type Snapshot,
  type SyncMeta,
} from './types';

export const COLLECTIONS: CollectionName[] = ['events', 'days', 'reminders', 'countdowns', 'sounds', 'journal', 'money', 'health'];

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
    money: [],
    health: [],
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
  const from = r.schemaVersion ?? 1;
  if (from < 3 && Array.isArray(r.events)) migrateToV3(snap);
  if (from < 4) snap.money = migrateMoneyToV4(snap.money);
  // v5 added the `health` collection (an empty list above). Health is always
  // private, whatever the stored data says.
  snap.health = snap.health.map(asPrivateHealth);
  return snap;
}

/**
 * v3: private by default, and reminders became part of events.
 *  - Existing events, days and countdowns become private (sharing is opt-in).
 *  - Each standalone reminder turns into an event that notifies at its time;
 *    the old reminder is deleted (a tombstone, so sync removes it too).
 */
function migrateToV3(snap: Snapshot) {
  const now = Date.now();
  const priv = <T extends SyncMeta>(x: T): T => (x.visibility === 'private' ? x : { ...x, visibility: 'private', updatedAt: Math.max(now, (x.updatedAt ?? 0) + 1) });
  snap.events = snap.events.map(priv);
  snap.days = snap.days.map(priv);
  snap.countdowns = snap.countdowns.map(priv);
  for (const r of snap.reminders) {
    if (r.deletedAt) continue;
    snap.events.push({
      id: r.id,
      createdAt: r.createdAt,
      updatedAt: now,
      deletedAt: null,
      ownerId: r.ownerId,
      visibility: 'private',
      title: r.title,
      allDay: false,
      start: r.at,
      end: r.at,
      color: 'lilac',
      notes: r.note ?? '',
      location: '',
      repeat: r.repeat,
      remindBefore: [0],
      sound: r.sound,
    });
  }
  snap.reminders = snap.reminders.map((r) => (r.deletedAt ? r : { ...r, deletedAt: now, updatedAt: now }));
}

export function newMeta(now = Date.now()): SyncMeta {
  // Everything is private unless the person chooses to share it.
  return { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, ownerId: 'local', visibility: 'private' };
}

export function upsert<C extends CollectionName>(snap: Snapshot, coll: C, item0: RecordOf<C>): Snapshot {
  const item = (coll === 'health' ? asPrivateHealth(item0 as HealthItem) : item0) as RecordOf<C>;
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
    for (const x0 of incoming[c] as SyncMeta[]) {
      const x = c === 'health' ? asPrivateHealth(x0 as HealthItem) : x0;
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

// ---------------------------------------------------------------- day info is always private
//
// What's written on a day (busy dot, notes, to-dos, stickers) belongs to the
// person who wrote it. Older versions could save it as shared, so a date may
// still have a shared record (yours from back then, or your partner's).

/** One day record per date for this person: their private one if it exists, else an older shared one. */
export function personalDays(list: DayEntry[]): DayEntry[] {
  const byDate = new Map<string, DayEntry>();
  for (const d of list) {
    if (d.deletedAt) continue;
    const cur = byDate.get(d.date);
    if (!cur || (cur.visibility === 'shared' && d.visibility === 'private')) byDate.set(d.date, d);
  }
  return [...byDate.values()];
}

/**
 * Saving day info never writes into a shared record: the change goes into
 * this person's private record for that date (created if needed). The shared
 * record itself is left untouched, so nothing changes for the partner.
 */
export function asPrivateDay(item: DayEntry, list: DayEntry[], now = Date.now()): DayEntry {
  if (item.visibility === 'private') return item;
  const mine = list.find((d) => d.date === item.date && d.visibility === 'private' && !d.deletedAt);
  const meta = mine ? { id: mine.id, createdAt: mine.createdAt, ownerId: mine.ownerId } : { id: uuid(), createdAt: now, ownerId: 'local' };
  return { ...item, ...meta, visibility: 'private', deletedAt: null };
}

// ---------------------------------------------------------------- health is always private

/** Health records are never shared: whatever comes in, it is stored as private. */
export function asPrivateHealth<T extends HealthItem>(item: T): T {
  return item.visibility === 'private' ? item : { ...item, visibility: 'private' };
}
