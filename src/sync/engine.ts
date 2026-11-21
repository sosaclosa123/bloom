// Sync engine: keeps this device's data and the online copy in step.
//
//  - Local-first: the app always works offline; sync runs in the background.
//  - Each record goes to one place online:
//      private items  -> the person's own area (synced to their own devices)
//      shared items   -> the couple calendar (both partners see them)
//  - Conflicts: newest `updatedAt` wins (same rule as backup restore).
//  - Deletions sync as tombstones (`deletedAt`).
//  - Journal photos are uploaded/downloaded alongside their entry.
// Platform-independent: the desktop app and a future phone app both use it.
import { COLLECTIONS, normalizeSnapshot } from '../shared/db';
import type { CollectionName, Collections, JournalEntry, Snapshot, SyncMeta } from '../shared/types';
import type { AuthUser, Profile, RemoteItem, Scope, SpaceInfo, SyncBackend } from './backend';

/** Sounds are audio files on this PC, so they don't sync. */
export const SYNCED: CollectionName[] = COLLECTIONS.filter((c) => c !== 'sounds');

/** Collections that only ever live in the person's own area, never in the shared calendar. */
export const ALWAYS_PRIVATE: CollectionName[] = ['health'];

export interface LocalPort {
  snapshot(): Snapshot;
  onChange(cb: (s: Snapshot) => void): () => void;
  /** Merge records from the cloud into local data (newest wins). */
  applyRemote(c: Partial<Collections>): Promise<void>;
  readPhoto(fileName: string): Promise<string | null>;
  hasPhoto(fileName: string): Promise<boolean>;
  writePhoto(fileName: string, dataUrl: string): Promise<void>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SyncStatus = 'off' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  user: AuthUser | null;
  profile: Profile | null;
  space: SpaceInfo | null;
  status: SyncStatus;
  error: string | null;
  lastSync: number | null;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
export const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

const scopeKey = (s: Scope) => (s.kind === 'user' ? `u:${s.uid}` : `s:${s.sid}`);
const MAX_PHOTO_CHARS = 950_000; // Firestore documents max out at ~1 MB

interface Known {
  /** Newest version seen online, and where it lives. */
  [key: string]: { t: number; s: string };
}

export class SyncEngine {
  private state: SyncState = { user: null, profile: null, space: null, status: 'off', error: null, lastSync: null };
  private listeners = new Set<(s: SyncState) => void>();
  private unsubs: (() => void)[] = [];
  private known: Known = {};
  private uploaded = new Set<string>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private pushAgain = false;
  private pendingName: string | null = null;
  private loaded = new Set<string>(); // scopes whose first snapshot arrived

  private pushDelay: number;
  constructor(
    private backend: SyncBackend,
    private port: LocalPort,
    opts: { pushDelay?: number } = {},
  ) {
    this.pushDelay = opts.pushDelay ?? 800;
  }

  // ---------------------------------------------------------------- public

  start() {
    this.unsubs.push(this.backend.onAuth((u) => void this.onUser(u)));
    this.unsubs.push(this.port.onChange(() => this.schedulePush()));
  }

  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.stopScopes();
  }

  get(): SyncState {
    return this.state;
  }

  subscribe(cb: (s: SyncState) => void) {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  async signUp(name: string, email: string, password: string) {
    this.pendingName = name.trim();
    await this.backend.signUp(email.trim(), password);
  }

  async signIn(email: string, password: string) {
    await this.backend.signIn(email.trim(), password);
  }

  async signOut() {
    await this.backend.signOut();
  }

  /** Creates the shared couple calendar and returns its invite code. */
  async createSpace(): Promise<string> {
    const { user, profile } = this.need();
    const code = newInviteCode();
    const space = await this.backend.createSpace(user.uid, profile.name, code);
    await this.backend.setProfile(user.uid, { spaceId: code });
    this.set({ profile: { ...profile, spaceId: code }, space });
    this.watchSpace(code);
    return code;
  }

  async joinSpace(rawCode: string) {
    const { user, profile } = this.need();
    const code = normalizeCode(rawCode);
    const space = await this.backend.joinSpace(user.uid, profile.name, code);
    await this.backend.setProfile(user.uid, { spaceId: code });
    this.set({ profile: { ...profile, spaceId: code }, space });
    this.watchSpace(code);
  }

  async setName(name: string) {
    const { user, profile } = this.need();
    await this.backend.setProfile(user.uid, { name });
    this.set({ profile: { ...profile, name } });
  }

  /** Push now (e.g. "Sync now" button). */
  syncNow() {
    this.schedulePush(0);
  }

  // ---------------------------------------------------------------- auth

  private async onUser(user: AuthUser | null) {
    this.stopScopes();
    if (!user) {
      this.set({ user: null, profile: null, space: null, status: 'off', error: null });
      return;
    }
    this.set({ user, status: 'connecting', error: null });
    this.known = this.readJSON(`bloom-sync-known-${user.uid}`, {});
    this.uploaded = new Set(this.readJSON<string[]>(`bloom-sync-photos-${user.uid}`, []));
    try {
      let profile = await this.backend.getProfile(user.uid);
      if (!profile) {
        profile = { name: this.pendingName || user.email.split('@')[0], spaceId: null };
        await this.backend.setProfile(user.uid, profile);
      }
      this.pendingName = null;
      this.set({ profile });
      this.watchScope({ kind: 'user', uid: user.uid });
      if (profile.spaceId) this.watchSpace(profile.spaceId);
      this.schedulePush(0);
    } catch (e) {
      this.fail(e);
    }
  }

  private need() {
    const { user, profile } = this.state;
    if (!user || !profile) throw new Error('not-signed-in');
    return { user, profile };
  }

  // ---------------------------------------------------------------- pulling

  private watchSpace(sid: string) {
    this.unsubs.push(
      this.backend.onSpace(sid, (space) => {
        if (space) this.set({ space });
      }),
    );
    this.watchScope({ kind: 'space', sid });
  }

  private scopeUnsubs: (() => void)[] = [];
  private stopScopes() {
    this.scopeUnsubs.forEach((u) => u());
    this.scopeUnsubs = [];
    this.loaded.clear();
  }

  private watchScope(scope: Scope) {
    this.scopeUnsubs.push(
      this.backend.subscribe(
        scope,
        (items) => void this.onRemote(scope, items),
        (e) => this.fail(e),
      ),
    );
  }

  private async onRemote(scope: Scope, items: RemoteItem[]) {
    const sk = scopeKey(scope);
    const incoming: Partial<Record<CollectionName, SyncMeta[]>> = {};
    for (const it of items) {
      if (!SYNCED.includes(it.coll)) continue;
      // Health is never taken from a shared calendar (it can only be in our own area).
      if (scope.kind === 'space' && ALWAYS_PRIVATE.includes(it.coll)) continue;
      const key = `${it.coll}/${it.id}`;
      const k = this.known[key];
      // Ignore a tombstone left behind in a scope this record moved out of.
      if (k && k.s !== sk && k.t >= it.updatedAt) continue;
      if (!k || it.updatedAt >= k.t) this.known[key] = { t: it.updatedAt, s: sk };
      (incoming[it.coll] ??= []).push(it.data as unknown as SyncMeta);
    }
    this.saveKnown();
    if (Object.keys(incoming).length) await this.port.applyRemote(incoming as Partial<Collections>);
    this.loaded.add(sk);
    // Fetch photos of journal entries we just received.
    for (const e of (incoming.journal ?? []) as JournalEntry[]) {
      if (e.deletedAt) continue;
      for (const p of e.photos ?? []) {
        try {
          if (await this.port.hasPhoto(p.fileName)) continue;
          const data = await this.backend.getPhoto(scope, p.fileName);
          if (data) await this.port.writePhoto(p.fileName, data);
        } catch {
          /* try again next time */
        }
      }
    }
    if (this.state.status === 'connecting' || this.state.status === 'error') this.set({ status: 'synced', error: null, lastSync: Date.now() });
    else this.set({ lastSync: Date.now() });
  }

  // ---------------------------------------------------------------- pushing

  scopeFor(coll: CollectionName, rec: SyncMeta): Scope | null {
    const { user, profile } = this.state;
    if (!user || !profile) return null;
    // Health (and anything else always-private) goes to the person's own area,
    // even if a record somehow says 'shared'.
    if (ALWAYS_PRIVATE.includes(coll)) return { kind: 'user', uid: user.uid };
    // Use the saved calendar id (not the loaded space info) so nothing is
    // ever moved out of the shared calendar just because it's still loading.
    if (rec.visibility === 'private' || !profile.spaceId) return { kind: 'user', uid: user.uid };
    return { kind: 'space', sid: profile.spaceId };
  }

  private schedulePush(delay = this.pushDelay) {
    if (!this.state.user) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), delay);
  }

  private async push() {
    if (!this.state.user || !this.state.profile) return;
    if (this.pushing) {
      this.pushAgain = true;
      return;
    }
    this.pushing = true;
    try {
      const snap = this.port.snapshot();
      const batches = new Map<string, { scope: Scope; items: RemoteItem[]; marks: [string, number, string][] }>();
      const add = (scope: Scope, item: RemoteItem, mark: boolean) => {
        const sk = scopeKey(scope);
        const b = batches.get(sk) ?? { scope, items: [], marks: [] };
        b.items.push(item);
        if (mark) b.marks.push([`${item.coll}/${item.id}`, item.updatedAt, sk]);
        batches.set(sk, b);
      };
      const photoJobs: { scope: Scope; fileName: string }[] = [];

      for (const coll of SYNCED) {
        for (const rec of snap[coll] as SyncMeta[]) {
          const scope = this.scopeFor(coll, rec);
          if (!scope) continue;
          const sk = scopeKey(scope);
          const key = `${coll}/${rec.id}`;
          const k = this.known[key];
          const t = rec.updatedAt ?? 0;
          if (k && k.t >= t && k.s === sk) continue; // already online
          if (k && k.s !== sk && !(k.t > t) && !(ALWAYS_PRIVATE.includes(coll) && k.s.startsWith('s:'))) {
            // Moved (e.g. shared -> private): leave a tombstone where it was.
            const old: Scope = k.s.startsWith('u:') ? { kind: 'user', uid: k.s.slice(2) } : { kind: 'space', sid: k.s.slice(2) };
            const tomb = { ...rec, deletedAt: rec.deletedAt ?? t, updatedAt: t };
            add(old, { coll, id: rec.id, updatedAt: t, data: tomb as unknown as Record<string, unknown> }, false);
          }
          if (k && k.t > t) continue; // a newer version is online already
          add(scope, { coll, id: rec.id, updatedAt: t, data: rec as unknown as Record<string, unknown> }, true);
          if (coll === 'journal' && !rec.deletedAt) {
            for (const p of (rec as unknown as JournalEntry).photos ?? []) {
              if (!this.uploaded.has(`${sk}|${p.fileName}`)) photoJobs.push({ scope, fileName: p.fileName });
            }
          }
        }
      }

      if (batches.size) this.set({ status: 'syncing' });
      for (const job of photoJobs) {
        const data = await this.port.readPhoto(job.fileName);
        if (data && data.length <= MAX_PHOTO_CHARS) {
          await this.backend.putPhoto(job.scope, job.fileName, data);
          this.uploaded.add(`${scopeKey(job.scope)}|${job.fileName}`);
        }
      }
      if (photoJobs.length) this.port.setItem(`bloom-sync-photos-${this.state.user.uid}`, JSON.stringify([...this.uploaded]));

      for (const b of batches.values()) {
        for (let i = 0; i < b.items.length; i += 400) await this.backend.put(b.scope, b.items.slice(i, i + 400));
        for (const [key, t, sk] of b.marks) this.known[key] = { t, s: sk };
      }
      this.saveKnown();
      this.set({ status: 'synced', error: null, lastSync: Date.now() });
    } catch (e) {
      this.fail(e);
      this.schedulePush(30_000); // retry later (offline, etc.)
    } finally {
      this.pushing = false;
      if (this.pushAgain) {
        this.pushAgain = false;
        this.schedulePush(0);
      }
    }
  }

  // ---------------------------------------------------------------- helpers

  private fail(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.set({ status: offline ? 'offline' : 'error', error: msg });
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private saveKnown() {
    if (this.state.user) this.port.setItem(`bloom-sync-known-${this.state.user.uid}`, JSON.stringify(this.known));
  }

  private readJSON<T>(key: string, fallback: T): T {
    try {
      return (JSON.parse(this.port.getItem(key) || 'null') as T) ?? fallback;
    } catch {
      return fallback;
    }
  }
}

/** Merge helper for ports: applies incoming records into a snapshot (newest wins). */
export function partialToSnapshot(base: Snapshot, c: Partial<Collections>): Snapshot {
  return normalizeSnapshot({ ...base, ...Object.fromEntries(COLLECTIONS.map((k) => [k, c[k] ?? []])) });
}
