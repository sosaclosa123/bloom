// What the sync engine needs from an online backend. Firebase implements it
// (firebase.ts); tests use an in-memory fake. A phone app reuses the same
// engine and backend.
import type { CollectionName } from '../shared/types';

/** Where a record lives online: the person's own area, or the shared couple calendar. */
export type Scope = { kind: 'user'; uid: string } | { kind: 'space'; sid: string };

export interface RemoteItem {
  coll: CollectionName;
  id: string;
  updatedAt: number;
  data: Record<string, unknown>;
}

export interface AuthUser {
  uid: string;
  email: string;
}

export interface Profile {
  name: string;
  spaceId: string | null;
}

export interface SpaceInfo {
  id: string;
  members: string[];
  names: Record<string, string>;
}

export interface SyncBackend {
  onAuth(cb: (user: AuthUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;

  getProfile(uid: string): Promise<Profile | null>;
  setProfile(uid: string, p: Partial<Profile>): Promise<void>;

  /** Creates a shared calendar; its id doubles as the invite code. */
  createSpace(uid: string, name: string, id: string): Promise<SpaceInfo>;
  /** Joins with an invite code. Throws 'not-found' or 'full'. */
  joinSpace(uid: string, name: string, id: string): Promise<SpaceInfo>;
  getSpace(id: string): Promise<SpaceInfo | null>;
  onSpace(id: string, cb: (s: SpaceInfo | null) => void): () => void;

  /** Live feed of every item in a scope (all of them first, then changes). */
  subscribe(scope: Scope, cb: (items: RemoteItem[]) => void, onError: (e: unknown) => void): () => void;
  put(scope: Scope, items: RemoteItem[]): Promise<void>;

  putPhoto(scope: Scope, fileName: string, dataUrl: string): Promise<void>;
  getPhoto(scope: Scope, fileName: string): Promise<string | null>;
}
