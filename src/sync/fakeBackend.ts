// In-memory stand-in for Firebase, used by tests. Enforces the same rules as
// firebase/firestore.rules (private areas, members-only calendars, max 2).
import type { AuthUser, FeedInfo, Profile, RemoteItem, Scope, SpaceInfo, SyncBackend } from './backend';

export class FakeCloud {
  users = new Map<string, { email: string; password: string; uid: string }>();
  profiles = new Map<string, Profile>();
  spaces = new Map<string, SpaceInfo>();
  items = new Map<string, Map<string, RemoteItem>>(); // scopeKey -> docId -> item
  photos = new Map<string, string>();
  subs = new Set<{ key: string; cb: (items: RemoteItem[], info: FeedInfo) => void; onError: (e: unknown) => void }>();
  /** Server clock for save times (ms, always rising). */
  clock = 1_000;
  /** Documents downloaded (Firebase bills each one as a read). */
  reads = 0;
  /** A batch with any of these ids is refused like Firestore refuses a bad document. */
  badIds = new Set<string>();
  /** Stops every live feed with this error (quota used up, token expired…). */
  breakFeeds(e: unknown = new Error('resource-exhausted')) {
    const subs = [...this.subs];
    this.subs.clear();
    subs.forEach((s) => s.onError(e));
  }
  spaceSubs = new Set<{ id: string; cb: (s: SpaceInfo | null) => void }>();
  next = 1;
}

const key = (s: Scope) => (s.kind === 'user' ? `u:${s.uid}` : `s:${s.sid}`);
const tick = () => new Promise((r) => setTimeout(r, 0));
const markOf = (items: RemoteItem[]) => (items.length ? Math.max(...items.map((it) => it.serverAt ?? 0)) : null);

export class FakeBackend implements SyncBackend {
  private user: AuthUser | null = null;
  private authCbs = new Set<(u: AuthUser | null) => void>();
  constructor(private cloud: FakeCloud) {}

  private can(scope: Scope) {
    if (!this.user) return false;
    if (scope.kind === 'user') return scope.uid === this.user.uid;
    return !!this.cloud.spaces.get(scope.sid)?.members.includes(this.user.uid);
  }
  private emitAuth() {
    this.authCbs.forEach((cb) => cb(this.user));
  }

  onAuth(cb: (u: AuthUser | null) => void) {
    this.authCbs.add(cb);
    setTimeout(() => cb(this.user), 0);
    return () => this.authCbs.delete(cb);
  }
  async signUp(email: string, password: string) {
    if (this.cloud.users.has(email)) throw new Error('auth/email-already-in-use');
    const u = { email, password, uid: `uid${this.cloud.next++}` };
    this.cloud.users.set(email, u);
    this.user = { uid: u.uid, email };
    this.emitAuth();
    return this.user;
  }
  async signIn(email: string, password: string) {
    const u = this.cloud.users.get(email);
    if (!u || u.password !== password) throw new Error('auth/invalid-credential');
    this.user = { uid: u.uid, email };
    this.emitAuth();
    return this.user;
  }
  async signOut() {
    this.user = null;
    this.emitAuth();
  }
  async getProfile(uid: string) {
    return this.cloud.profiles.get(uid) ?? null;
  }
  async setProfile(uid: string, p: Partial<Profile>) {
    if (uid !== this.user?.uid) throw new Error('permission-denied');
    this.cloud.profiles.set(uid, { name: '', spaceId: null, ...this.cloud.profiles.get(uid), ...p });
  }
  async createSpace(uid: string, name: string, id: string) {
    const s: SpaceInfo = { id, members: [uid], names: { [uid]: name } };
    this.cloud.spaces.set(id, s);
    return s;
  }
  async joinSpace(uid: string, name: string, id: string) {
    const s = this.cloud.spaces.get(id);
    if (!s) throw new Error('not-found');
    if (!s.members.includes(uid)) {
      if (s.members.length >= 2) throw new Error('full');
      s.members = [...s.members, uid];
      s.names = { ...s.names, [uid]: name };
      this.cloud.spaceSubs.forEach((x) => x.id === id && x.cb(s));
    }
    return s;
  }
  async getSpace(id: string) {
    const s = this.cloud.spaces.get(id);
    // Same as the rules: a full couple is hidden from everyone else.
    if (s && this.user && !s.members.includes(this.user.uid) && s.members.length >= 2) throw new Error('permission-denied');
    return s ?? null;
  }
  onSpace(id: string, cb: (s: SpaceInfo | null) => void) {
    const sub = { id, cb };
    this.cloud.spaceSubs.add(sub);
    setTimeout(() => cb(this.cloud.spaces.get(id) ?? null), 0);
    return () => this.cloud.spaceSubs.delete(sub);
  }
  subscribe(scope: Scope, since: number | null, cb: (items: RemoteItem[], info: FeedInfo) => void, onError: (e: unknown) => void) {
    if (!this.can(scope)) {
      setTimeout(() => onError(new Error('permission-denied')), 0);
      return () => {};
    }
    const sub = { key: key(scope), cb, onError };
    this.cloud.subs.add(sub);
    setTimeout(() => {
      if (!this.cloud.subs.has(sub)) return;
      const all = [...(this.cloud.items.get(sub.key)?.values() ?? [])].filter((it) => !since || (it.serverAt ?? 0) > since);
      this.cloud.reads += Math.max(1, all.length); // an empty answer still costs one read
      cb(structuredClone(all), { mark: markOf(all) });
    }, 0);
    return () => this.cloud.subs.delete(sub);
  }
  async put(scope: Scope, items: RemoteItem[]) {
    if (!this.can(scope)) throw new Error('permission-denied');
    if (items.some((it) => this.cloud.badIds.has(it.id))) throw Object.assign(new Error('invalid-argument'), { code: 'invalid-argument' });
    const k = key(scope);
    const m = this.cloud.items.get(k) ?? new Map();
    const saved = items.map((it) => ({ ...structuredClone(it), serverAt: ++this.cloud.clock }));
    for (const it of saved) m.set(`${it.coll}_${it.id}`, it);
    this.cloud.items.set(k, m);
    await tick();
    this.cloud.subs.forEach((s) => {
      if (s.key !== k) return;
      this.cloud.reads += saved.length;
      s.cb(structuredClone(saved), { mark: markOf(saved) });
    });
  }
  async putPhoto(scope: Scope, fileName: string, dataUrl: string) {
    if (!this.can(scope)) throw new Error('permission-denied');
    this.cloud.photos.set(`${key(scope)}/${fileName}`, dataUrl);
  }
  async getPhoto(scope: Scope, fileName: string) {
    if (!this.can(scope)) throw new Error('permission-denied');
    return this.cloud.photos.get(`${key(scope)}/${fileName}`) ?? null;
  }
}
