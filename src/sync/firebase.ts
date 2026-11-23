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
  doc,
  getDoc,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import type { AuthUser, Profile, RemoteItem, Scope, SpaceInfo, SyncBackend } from './backend';

export function createFirebaseBackend(config: FirebaseOptions): SyncBackend {
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // Bloom keeps its own local copy, so Firestore only needs a memory cache.
  const db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });

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

    subscribe(scope, cb, onError) {
      const [a, b] = base(scope);
      return onSnapshot(
        collection(db, a, b, 'items'),
        (snap) => {
          const items = snap
            .docChanges()
            .filter((c) => c.type !== 'removed')
            .map((c) => c.doc.data() as RemoteItem);
          if (items.length) cb(items);
          else if (snap.metadata.fromCache === false) cb([]);
        },
        onError,
      );
    },
    async put(scope, items) {
      const [a, b] = base(scope);
      const batch = writeBatch(db);
      for (const it of items) batch.set(doc(db, a, b, 'items', `${it.coll}_${it.id}`), it);
      await batch.commit();
    },

    async putPhoto(scope, fileName, dataUrl) {
      const [a, b] = base(scope);
      await setDoc(doc(db, a, b, 'photos', fileName), { data: dataUrl });
    },
    async getPhoto(scope, fileName) {
      const [a, b] = base(scope);
      const snap = await getDoc(doc(db, a, b, 'photos', fileName));
      return snap.exists() ? ((snap.data().data as string) ?? null) : null;
    },
  };
}
