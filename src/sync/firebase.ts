// Firebase implementation of SyncBackend.
// Layout in Firestore (see firebase/firestore.rules):
//   users/{uid}                      profile { name, spaceId }
//   users/{uid}/items/{coll_id}      private records
//   users/{uid}/photos/{file}        private journal photos
//   spaces/{code}                    { members, names }  (code = invite code)
//   spaces/{code}/items/{coll_id}    shared records
//   spaces/{code}/photos/{file}      shared journal photos
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  arrayUnion,
  collection,
  getDocs,
  increment,
  connectFirestoreEmulator,
  doc,
  getDoc,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import type { AuthUser, LibraryItem, Profile, RemoteItem, Scope, SpaceInfo, SyncBackend } from './backend';

/** Tests only: run against the local Firebase emulator (several devices = several app names). */
export interface EmulatorOptions {
  name?: string;
  host: string;
  firestorePort: number;
  authPort: number;
}

/** A Firestore document id for a product key ('il:123', 'off:729…', 'my:…'). */
const libId = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 140);

export function createFirebaseBackend(config: FirebaseOptions, emulator?: EmulatorOptions): SyncBackend {
  const app = initializeApp(config, emulator?.name);
  const auth = initializeAuth(app, { persistence: emulator ? [] : [indexedDBLocalPersistence, browserLocalPersistence] });
  // Bloom keeps its own local copy, so Firestore only needs a memory cache.
  const db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
  }

  const base = (s: Scope) => (s.kind === 'user' ? ['users', s.uid] : ['spaces', s.sid]);
  const toUser = (u: { uid: string; email: string | null }): AuthUser => ({ uid: u.uid, email: u.email ?? '' });
  const toSpace = (id: string, d: DocumentData | undefined): SpaceInfo | null =>
    d ? { id, members: (d.members as string[]) ?? [], names: (d.names as Record<string, string>) ?? {} } : null;

  return {
    onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null)),
    signUp: async (email, password) => toUser((await createUserWithEmailAndPassword(auth, email, password)).user),
    signIn: async (email, password) => toUser((await signInWithEmailAndPassword(auth, email, password)).user),
    signOut: () => signOut(auth),

    async getProfile(uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      return { name: (d.name as string) ?? '', spaceId: (d.spaceId as string) ?? null };
    },
    async setProfile(uid, p: Partial<Profile>) {
      await setDoc(doc(db, 'users', uid), p, { merge: true });
    },

    async createSpace(uid, name, id) {
      const data = { members: [uid], names: { [uid]: name }, createdAt: Date.now() };
      await setDoc(doc(db, 'spaces', id), data);
      return { id, members: data.members, names: data.names };
    },
    async joinSpace(uid, name, id) {
      const ref = doc(db, 'spaces', id);
      // A full couple calendar can't be read by outsiders (security rules): that means "full".
      const snap = await getDoc(ref).catch((e: unknown) => {
        if (String((e as { code?: string })?.code ?? e).includes('permission-denied')) throw new Error('full');
        throw e;
      });
      if (!snap.exists()) throw new Error('not-found');
      const s = toSpace(id, snap.data())!;
      if (s.members.includes(uid)) return s;
      if (s.members.length >= 2) throw new Error('full');
      await updateDoc(ref, { members: arrayUnion(uid), [`names.${uid}`]: name });
      return { ...s, members: [...s.members, uid], names: { ...s.names, [uid]: name } };
    },
    async getSpace(id) {
      const snap = await getDoc(doc(db, 'spaces', id));
      return toSpace(id, snap.data());
    },
    onSpace: (id, cb) =>
      onSnapshot(
        doc(db, 'spaces', id),
        (snap) => cb(toSpace(id, snap.data())),
        () => cb(null),
      ),

    subscribe(scope, since, cb, onError) {
      const [a, b] = base(scope);
      const items = collection(db, a, b, 'items');
      // Only what the server saved after `since` (an older item without a save
      // time is only in the full feed, which runs now and then).
      const q = since ? query(items, where('serverAt', '>', Timestamp.fromMillis(since))) : items;
      return onSnapshot(
        q,
        (snap) => {
          let mark: number | null = null;
          const out: RemoteItem[] = [];
          for (const c of snap.docChanges()) {
            if (c.type === 'removed') continue;
            const d = c.doc.data();
            const at = d.serverAt instanceof Timestamp ? d.serverAt.toMillis() : null;
            // Our own unsent write has no server time yet; it comes back once saved.
            if (at !== null && !c.doc.metadata.hasPendingWrites) mark = Math.max(mark ?? 0, at);
            out.push({ coll: d.coll, id: d.id, updatedAt: d.updatedAt, data: d.data, serverAt: at ?? undefined } as RemoteItem);
          }
          if (out.length || snap.metadata.fromCache === false) cb(out, { mark });
        },
        onError,
      );
    },
    async put(scope, items) {
      const [a, b] = base(scope);
      const batch = writeBatch(db);
      for (const it of items) batch.set(doc(db, a, b, 'items', `${it.coll}_${it.id}`), { ...it, serverAt: serverTimestamp() });
      await batch.commit();
    },

    async putPhoto(scope, fileName, dataUrl) {
      const [a, b] = base(scope);
      await setDoc(doc(db, a, b, 'photos', fileName), { data: dataUrl });
    },
    // Shared food library: one document per product, readable by every signed-in
    // user; only name + nutrition + vote counts (rules in firebase/firestore.rules).
    async libraryFetch(since) {
      const col = collection(db, 'library');
      const q = since ? query(col, where('updatedAt', '>', Timestamp.fromMillis(since))) : col;
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const x = d.data();
        return { ...x, key: x.key ?? d.id, up: x.up ?? 0, down: x.down ?? 0, updatedAt: x.updatedAt instanceof Timestamp ? x.updatedAt.toMillis() : 0 } as LibraryItem;
      });
    },
    async libraryPut(item) {
      const clean = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
      await setDoc(doc(db, 'library', libId(item.key)), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
    },
    async libraryVote(key, name, up, down) {
      await setDoc(doc(db, 'library', libId(key)), { key, name, up: increment(up), down: increment(down), updatedAt: serverTimestamp() }, { merge: true });
    },

    async getPhoto(scope, fileName) {
      const [a, b] = base(scope);
      const snap = await getDoc(doc(db, a, b, 'photos', fileName));
      return snap.exists() ? ((snap.data().data as string) ?? null) : null;
    },
  };
}
