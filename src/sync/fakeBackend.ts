// In-memory stand-in for Firebase, used by tests. Enforces the same rules as
// firebase/firestore.rules (private areas, members-only calendars, max 2).
import type { AuthUser, Profile, RemoteItem, Scope, SpaceInfo, SyncBackend } from './backend';

export class FakeCloud {
  users = new Map<string, { email: string; password: string; uid: string }>();
  profiles = new Map<string, Profile>();
  spaces = new Map<string, SpaceInfo>();
  items = new Map<string, Map<string, RemoteItem>>(); // scopeKey -> docId -> item
  photos = new Map<string, string>();
  subs = new Set<{ key: string; cb: (items: RemoteItem[]) => void }>();
  spaceSubs = new Set<{ id: string; cb: (s: SpaceInfo | null) => void }>();
  next = 1;
}

const key = (s: Scope) => (s.kind === 'user' ? `u:${s.uid}` : `s:${s.sid}`);
const tick = () => new Promise((r) => setTimeout(r, 0));

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
    return this.cloud.spaces.get(id) ?? null;
  }
  onSpace(id: string, cb: (s: SpaceInfo | null) => void) {
    const sub = { id, cb };
    this.cloud.spaceSubs.add(sub);
    setTimeout(() => cb(this.cloud.spaces.get(id) ?? null), 0);
    return () => this.cloud.spaceSubs.delete(sub);
  }
  subscribe(scope: Scope, cb: (items: RemoteItem[]) => void, onError: (e: unknown) => void) {
    if (!this.can(scope)) {
      setTimeout(() => onError(new Error('permission-denied')), 0);
      return () => {};
    }
    const sub = { key: key(scope), cb };
    this.cloud.subs.add(sub);
    setTimeout(() => cb(structuredClone([...(this.cloud.items.get(sub.key)?.values() ?? [])])), 0);
    return () => this.cloud.subs.delete(sub);
  }
  async put(scope: Scope, items: RemoteItem[]) {
    if (!this.can(scope)) throw new Error('permission-denied');
    const k = key(scope);
    const m = this.cloud.items.get(k) ?? new Map();
    for (const it of items) m.set(`${it.coll}_${it.id}`, structuredClone(it));
    this.cloud.items.set(k, m);
    await tick();
    this.cloud.subs.forEach((s) => s.key === k && s.cb(structuredClone(items)));
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
