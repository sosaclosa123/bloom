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
import type { CollectionName, Collections, HealthItem, JournalEntry, PhotoRef, Settings, Snapshot, SyncMeta } from '../shared/types';
import type { AuthUser, FeedInfo, Profile, RemoteItem, Scope, SpaceInfo, SyncBackend } from './backend';

/** Sounds are audio files on this PC, so they don't sync. */
export const SYNCED: CollectionName[] = COLLECTIONS.filter((c) => c !== 'sounds');

/** Collections that only ever live in the person's own area, never in the shared calendar. */
export const ALWAYS_PRIVATE: CollectionName[] = ['health'];

/**
 * Settings that follow the account to every PC and phone (owner's choice,
 * Nov 2026), kept in one private document. Everything else stays per device:
 * the look (text size, light/dark, Hebrew dates shown), start with Windows,
 * tray, startup window, game mode, volume, reminder sound and the backup
 * folder. Any account setting can also be kept on one device only (the
 * person picks "Only this device" when changing it: `settings.localKeys`).
 */
export const ACCOUNT_SETTINGS = [
  'language',
  'weekStart',
  'holidays',
  'holidaysIsrael',
  'defaultRemindBefore',
  'snoozeOptions',
  'currency',
  'monthColors',
  'healthEnabled',
  'healthIbd',
  'healthMedNames',
  'healthWaterNudge',
  'healthWaterFrom',
  'healthWaterTo',
  'healthWeighDay',
  'healthStickerBook',
  'healthGoals',
  'healthChallenges',
  'healthFoodOnline',
] as const satisfies readonly (keyof Settings)[];
type AccountKey = (typeof ACCOUNT_SETTINGS)[number];
/** One setting's agreed value (JSON text) and when it was last changed. */
type PrefVersions = Partial<Record<AccountKey, { v: string; t: number }>>;
const PREFS_COLL = 'prefs' as CollectionName;
const PREFS_ID = 'settings';

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
  /** Settings that changed on another device of this account. */
  applySettings?(patch: Partial<Settings>): Promise<void>;
  /**
   * Show the signed-in account's data (uid) or this computer's offline data
   * (null). `forget` = an account whose local copy is deleted (signing out).
   */
  switchProfile?(uid: string | null, forget?: string | null): Promise<void>;
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
/**
 * Listening downloads only what changed since the last time (Firebase bills
 * every downloaded item, ~50,000 a day free). A full download now and then
 * also catches anything an older app version saved without a server time.
 */
const FULL_EVERY_MS = 12 * 3600_000;
/** Wait before listening again after the live feed stopped (doubles up to 10 min). */
const RELISTEN_MS = [5_000, 30_000, 60_000, 120_000, 300_000, 600_000];
/** Short error text for the status line (Firebase codes like "resource-exhausted"). */
export function errorText(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  const msg = e instanceof Error ? e.message : String(e);
  return typeof code === 'string' && !msg.includes(code) ? `${code}: ${msg}` : msg;
}
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
  /** Per scope: newest server save time received, and when everything was last downloaded. */
  private marks: Record<string, { mark: number; full: number }> = {};
  private relisten = new Map<string, { timer: ReturnType<typeof setTimeout>; tries: number }>();
  /** Records the server refused (bad data): skipped until they change again, so they never block the rest. */
  private refused = new Map<string, number>();

  private pushDelay: number;
  private relistenMs: number[];
  /**
   * Weight of this device's settings the first time an account syncs them:
   * a PC (2) beats a new phone (1), so installing the phone app never resets
   * the PC's settings; any real change later (time stamp) beats both.
   */
  private prefsFirstWeight: number;
  private prefs: PrefVersions = {};
  /** Values last seen in this device's settings (to tell a local change from a remote one). */
  private prefsLocal: Partial<Record<AccountKey, string>> = {};
  private prefsPush = false;
  constructor(
    private backend: SyncBackend,
    private port: LocalPort,
    opts: { pushDelay?: number; prefsFirstWeight?: number; relistenMs?: number[] } = {},
  ) {
    this.pushDelay = opts.pushDelay ?? 800;
    this.relistenMs = opts.relistenMs ?? RELISTEN_MS;
    this.prefsFirstWeight = opts.prefsFirstWeight ?? 1;
  }

  // ---------------------------------------------------------------- public

  start() {
    this.unsubs.push(this.backend.onAuth((u) => void this.onUser(u)));
    this.unsubs.push(
      this.port.onChange((s) => {
        this.notePrefsChange(s.settings);
        this.schedulePush();
      }),
    );
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

  /** Things not yet saved online (signing out now would lose them). */
  unsyncedCount(): number {
    const { user, profile } = this.state;
    if (!user || !profile) return 0;
    const snap = this.port.snapshot();
    let n = 0;
    for (const coll of SYNCED) {
      for (const rec of snap[coll] as SyncMeta[]) {
        const scope = this.scopeFor(coll, rec);
        if (!scope) continue;
        const k = this.known[`${coll}/${rec.id}`];
        if (!k || k.t < (rec.updatedAt ?? 0)) n++;
      }
    }
    return n;
  }

  /** Upload everything now and wait for it. Returns how many things are still not online. */
  async flush(): Promise<number> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    for (let i = 0; i < 3 && (this.unsyncedCount() > 0 || this.prefsPush); i++) {
      while (this.pushing) await new Promise((r) => setTimeout(r, 50));
      await this.push();
    }
    return this.unsyncedCount();
  }

  /**
   * Sign out: the account's things stay online (and in backups) but are
   * removed from this computer, which goes back to its own offline data.
   * Call flush() first so nothing unsynced is lost.
   */
  async signOut() {
    const uid = this.state.user?.uid ?? null;
    this.forgetOnSignOut = uid;
    await this.backend.signOut();
  }
  private forgetOnSignOut: string | null = null;

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

  /**
   * Listen again from scratch (fresh copy of everything online). Used when the
   * app comes back from the background: a phone can quietly lose the live
   * connection while it's hidden, and changes made on the PC meanwhile (or
   * deletions) would otherwise only show after a restart.
   */
  refresh(full = false) {
    const { user, profile } = this.state;
    if (!user || !profile) return;
    this.stopScopes();
    if (full) this.refused.clear();
    this.watchScope({ kind: 'user', uid: user.uid }, full);
    if (profile.spaceId) this.watchScope({ kind: 'space', sid: profile.spaceId }, full);
    this.schedulePush(0);
  }

  // ---------------------------------------------------------------- auth

  private async onUser(user: AuthUser | null) {
    this.stopScopes();
    if (!user) {
      // Signed out: show this computer's offline data (and drop the account's copy if asked).
      const forget = this.forgetOnSignOut;
      this.forgetOnSignOut = null;
      if (forget) {
        this.port.setItem(`bloom-sync-known-${forget}`, '{}');
        this.port.setItem(`bloom-sync-photos-${forget}`, '[]');
        this.port.setItem(`bloom-sync-marks-${forget}`, '{}');
      }
      this.known = {};
      this.marks = {};
      await this.port.switchProfile?.(null, forget);
      this.set({ user: null, profile: null, space: null, status: 'off', error: null });
      return;
    }
    // Signed in: this account's data (downloaded from online if this computer doesn't have it yet).
    await this.port.switchProfile?.(user.uid);
    this.set({ user, status: 'connecting', error: null });
    this.known = this.readJSON(`bloom-sync-known-${user.uid}`, {});
    // Without what was received before, start over with a full download.
    this.marks = Object.keys(this.known).length ? this.readJSON(`bloom-sync-marks-${user.uid}`, {}) : {};
    this.uploaded = new Set(this.readJSON<string[]>(`bloom-sync-photos-${user.uid}`, []));
    this.loadPrefs(user.uid);
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

  private scopeUnsubs = new Map<string, () => void>();
  private stopScopes() {
    this.scopeUnsubs.forEach((u) => u());
    this.scopeUnsubs.clear();
    this.relisten.forEach((r) => clearTimeout(r.timer));
    this.relisten.clear();
    this.loaded.clear();
  }

  /**
   * Listen to a scope: only what changed since last time, or everything when
   * asked, when nothing was received yet, or every 12 hours. If the feed stops
   * (Firebase ends it on errors like a used-up quota or an expired sign-in),
   * listen again after a pause, so this device never silently stops receiving.
   */
  private watchScope(scope: Scope, full = false) {
    const sk = scopeKey(scope);
    this.scopeUnsubs.get(sk)?.();
    this.loaded.delete(sk);
    const m = this.marks[sk];
    const isFull = full || !m || Date.now() - m.full > FULL_EVERY_MS;
    let stopped = false;
    const unsub = this.backend.subscribe(
      scope,
      isFull ? null : m.mark,
      (items, info) => {
        if (stopped) return;
        const r = this.relisten.get(sk);
        if (r) r.tries = 0;
        void this.onRemote(scope, items, info, isFull);
      },
      (e) => {
        if (stopped) return;
        stopped = true;
        this.scopeUnsubs.delete(sk);
        this.fail(e);
        this.scheduleRelisten(scope);
      },
    );
    this.scopeUnsubs.set(sk, () => {
      stopped = true;
      unsub();
    });
  }

  private scheduleRelisten(scope: Scope) {
    const sk = scopeKey(scope);
    const prev = this.relisten.get(sk);
    if (prev) clearTimeout(prev.timer);
    const tries = prev?.tries ?? 0;
    const timer = setTimeout(
      () => {
        const uid = this.state.user?.uid;
        const stillOurs = scope.kind === 'user' ? scope.uid === uid : scope.sid === this.state.profile?.spaceId;
        if (uid && stillOurs) this.watchScope(scope);
      },
      this.relistenMs[Math.min(tries, this.relistenMs.length - 1)],
    );
    this.relisten.set(sk, { timer, tries: tries + 1 });
  }

  private async onRemote(scope: Scope, items: RemoteItem[], info: FeedInfo = { mark: null }, full = true) {
    const sk = scopeKey(scope);
    const first = !this.loaded.has(sk);
    const incoming: Partial<Record<CollectionName, SyncMeta[]>> = {};
    let prefsDoc: RemoteItem | null = null;
    for (const it of items) {
      if (it.coll === PREFS_COLL) {
        if (scope.kind === 'user' && it.id === PREFS_ID) prefsDoc = it;
        continue;
      }
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
    // No settings document in a "what changed" answer just means they didn't change.
    if (scope.kind === 'user' && (prefsDoc || (first && full))) await this.mergePrefs(prefsDoc);
    this.loaded.add(sk);
    // Remember how far we got (after the items are in the local data).
    const prev = this.marks[sk];
    const mark = Math.max(prev?.mark ?? 0, info.mark ?? 0);
    if (mark || (first && full)) {
      this.marks[sk] = { mark, full: first && full ? Date.now() : (prev?.full ?? 0) };
      if (this.state.user) this.port.setItem(`bloom-sync-marks-${this.state.user.uid}`, JSON.stringify(this.marks));
    }
    if (scope.kind === 'user' && this.prefsPush) this.schedulePush(0);
    // Fetch photos of journal entries and documents of doctor visits we just received.
    const withFiles = [...((incoming.journal ?? []) as JournalEntry[]), ...((incoming.health ?? []) as SyncMeta[]).map((h) => ({ deletedAt: h.deletedAt, photos: filesOf('health', h) }))];
    for (const e of withFiles) {
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
    if (this.state.status === 'connecting' || this.state.status === 'error') this.set({ status: 'synced', error: this.refusedNote(), lastSync: Date.now() });
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
      const photoJobs: { scope: Scope; fileName: string; key: string }[] = [];

      for (const coll of SYNCED) {
        for (const rec of snap[coll] as SyncMeta[]) {
          const scope = this.scopeFor(coll, rec);
          if (!scope) continue;
          const sk = scopeKey(scope);
          const key = `${coll}/${rec.id}`;
          const k = this.known[key];
          const t = rec.updatedAt ?? 0;
          if (k && k.t >= t && k.s === sk) continue; // already online
          if (this.refused.get(key) === t) continue; // the server refused this version
          if (k && k.s !== sk && !(k.t > t) && !(ALWAYS_PRIVATE.includes(coll) && k.s.startsWith('s:'))) {
            // Moved (e.g. shared -> private): leave a tombstone where it was.
            const old: Scope = k.s.startsWith('u:') ? { kind: 'user', uid: k.s.slice(2) } : { kind: 'space', sid: k.s.slice(2) };
            const tomb = { ...rec, deletedAt: rec.deletedAt ?? t, updatedAt: t };
            add(old, { coll, id: rec.id, updatedAt: t, data: tomb as unknown as Record<string, unknown> }, false);
          }
          if (k && k.t > t) continue; // a newer version is online already
          add(scope, { coll, id: rec.id, updatedAt: t, data: rec as unknown as Record<string, unknown> }, true);
          if (!rec.deletedAt) {
            for (const p of filesOf(coll, rec)) {
              if (!this.uploaded.has(`${sk}|${p.fileName}`)) photoJobs.push({ scope, fileName: p.fileName, key });
            }
          }
        }
      }

      // Account settings: one private document, only once this account's own area has loaded.
      const uid = this.state.user.uid;
      let prefsSent = false;
      if (this.prefsPush && this.loaded.has(`u:${uid}`)) {
        const t = Math.max(0, ...Object.values(this.prefs).map((p) => p!.t));
        add({ kind: 'user', uid }, { coll: PREFS_COLL, id: PREFS_ID, updatedAt: t, data: { ...this.prefs } }, false);
        prefsSent = true;
      }

      if (batches.size) this.set({ status: 'syncing' });
      // Photos before their entry (the other device fetches them when the
      // entry arrives). A photo that fails only holds back its own entry.
      let photoError: unknown = null;
      const held = new Set<string>();
      for (const job of photoJobs) {
        try {
          const data = await this.port.readPhoto(job.fileName);
          if (data && data.length <= MAX_PHOTO_CHARS) {
            await this.backend.putPhoto(job.scope, job.fileName, data);
            this.uploaded.add(`${scopeKey(job.scope)}|${job.fileName}`);
          }
        } catch (e) {
          photoError = e; // tried again on the next sync
          held.add(job.key);
        }
      }
      if (photoJobs.length) this.port.setItem(`bloom-sync-photos-${this.state.user.uid}`, JSON.stringify([...this.uploaded]));
      if (held.size) for (const b of batches.values()) b.items = b.items.filter((it) => !held.has(`${it.coll}/${it.id}`));

      for (const b of batches.values()) {
        const marks = new Map(b.marks.map(([key, t, sk]) => [key, [t, sk] as const]));
        const done = (items: RemoteItem[]) => {
          for (const it of items) {
            const m = marks.get(`${it.coll}/${it.id}`);
            if (m) this.known[`${it.coll}/${it.id}`] = { t: m[0], s: m[1] };
          }
          this.saveKnown();
        };
        for (const chunk of chunks(b.items)) {
          try {
            await this.backend.put(b.scope, chunk);
            done(chunk);
          } catch (e) {
            if (!isRefusal(e)) throw e;
            // One bad record must not stop everything else: send them one by one.
            for (const it of chunk) {
              try {
                await this.backend.put(b.scope, [it]);
                done([it]);
              } catch (e2) {
                if (!isRefusal(e2)) throw e2;
                this.refused.set(`${it.coll}/${it.id}`, it.updatedAt);
                console.error('bloom sync: the server refused', `${it.coll}/${it.id}`, e2);
              }
            }
          }
        }
      }
      if (prefsSent) this.prefsPush = false;

      if (photoError) throw photoError;
      this.set({ status: 'synced', error: this.refusedNote(), lastSync: Date.now() });
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

  // ---------------------------------------------------------------- account settings

  private prefsKey() {
    return `bloom-sync-prefs-${this.state.user?.uid}`;
  }

  /** On sign-in: the versions agreed before, plus this device's own values for any never synced. */
  private loadPrefs(uid: string) {
    this.prefs = this.readJSON<PrefVersions>(`bloom-sync-prefs-${uid}`, {});
    const s = this.port.snapshot().settings;
    this.prefsLocal = {};
    for (const k of ACCOUNT_SETTINGS) {
      const v = JSON.stringify(s[k] ?? null);
      this.prefsLocal[k] = v;
      if (!this.prefs[k]) this.prefs[k] = { v, t: this.prefsFirstWeight };
    }
    this.prefsPush = false;
    this.port.setItem(`bloom-sync-prefs-${uid}`, JSON.stringify(this.prefs));
  }

  /** A setting changed on this device: it now wins everywhere (newest change wins). */
  private notePrefsChange(s: Settings) {
    if (!this.state.user) return;
    let changed = false;
    for (const k of ACCOUNT_SETTINGS) {
      const v = JSON.stringify(s[k] ?? null);
      if (v === this.prefsLocal[k]) continue;
      this.prefsLocal[k] = v;
      if (s.localKeys?.includes(k)) continue; // kept on this device only
      if (this.prefs[k]?.v === v) continue; // it came from another device
      this.prefs[k] = { v, t: Math.max(Date.now(), (this.prefs[k]?.t ?? 0) + 1) };
      changed = true;
    }
    if (changed) {
      this.prefsPush = true;
      this.port.setItem(this.prefsKey(), JSON.stringify(this.prefs));
    }
  }

  /** Settings from online: take every newer one; send ours where ours is newer (or nothing is online yet). */
  private async mergePrefs(doc: RemoteItem | null) {
    const remote = (doc?.data ?? {}) as PrefVersions;
    const patch: Partial<Record<AccountKey, unknown>> = {};
    let ours = false;
    const localKeys = this.port.snapshot().settings.localKeys ?? [];
    for (const k of ACCOUNT_SETTINGS) {
      if (localKeys.includes(k)) continue; // this device keeps its own value
      const r = remote[k];
      const l = this.prefs[k];
      if (r && typeof r.t === 'number' && typeof r.v === 'string' && (!l || r.t >= l.t)) {
        if (!l || l.v !== r.v || l.t !== r.t) this.prefs[k] = { v: r.v, t: r.t };
        if (this.prefsLocal[k] !== r.v) {
          try {
            patch[k] = JSON.parse(r.v);
            this.prefsLocal[k] = r.v;
          } catch {
            /* ignore a broken value */
          }
        }
      } else if (l) ours = true;
    }
    if (ours) this.prefsPush = true;
    this.port.setItem(this.prefsKey(), JSON.stringify(this.prefs));
    if (Object.keys(patch).length) await this.port.applySettings?.(patch as Partial<Settings>);
  }

  // ---------------------------------------------------------------- helpers

  /** Shown under the status while the server refuses some records (so it's never silent). */
  private refusedNote(): string | null {
    return this.refused.size ? `refused: ${[...this.refused.keys()].slice(0, 3).join(', ')}${this.refused.size > 3 ? ` +${this.refused.size - 3}` : ''}` : null;
  }

  private fail(e: unknown) {
    const msg = errorText(e);
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

/** Files that travel with a record: journal photos and doctor-visit documents. */
export function filesOf(coll: CollectionName, rec: SyncMeta): PhotoRef[] {
  if (coll === 'journal') return (rec as unknown as JournalEntry).photos ?? [];
  const h = rec as unknown as HealthItem;
  if (coll === 'health' && h.kind === 'visit') return h.docs ?? [];
  return [];
}

/** Merge helper for ports: applies incoming records into a snapshot (newest wins). */
export function partialToSnapshot(base: Snapshot, c: Partial<Collections>): Snapshot {
  return normalizeSnapshot({ ...base, ...Object.fromEntries(COLLECTIONS.map((k) => [k, c[k] ?? []])) });
}

/** Batches Firestore accepts: at most 400 writes and about 4 MB each. */
function chunks(items: RemoteItem[]): RemoteItem[][] {
  const out: RemoteItem[][] = [];
  let cur: RemoteItem[] = [];
  let size = 0;
  for (const it of items) {
    const n = JSON.stringify(it.data).length;
    if (cur.length && (cur.length >= 400 || size + n > 4_000_000)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The server said no to the data itself (not a network problem). */
function isRefusal(e: unknown): boolean {
  const code = String((e as { code?: unknown })?.code ?? (e instanceof Error ? e.message : e));
  return /invalid-argument|failed-precondition|out-of-range/.test(code);
}
