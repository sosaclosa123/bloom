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
  /** When the server saved it (ms; set by the server, not the device's clock). */
  serverAt?: number;
}

/** One delivery from a live feed. */
export interface FeedInfo {
  /** Newest server save time in this delivery (to listen "from here" next time). */
  mark: number | null;
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

/**
 * The food library shared by all Bloom users (owner, Nov 2026): products
 * people added or corrected from package labels, and healthy / less healthy
 * votes. Only the food's name and nutrition; never who added or ate it.
 */
export interface LibraryItem {
  key: string; // product id ('il:…', 'off:<barcode>') or 'my:<id>'
  name: string;
  brand?: string;
  barcode?: string;
  liquid?: boolean;
  per100?: { kcal: number; protein: number; fat: number; carbs: number; sugars?: number | null; fiber?: number | null; satFat?: number | null; sodium?: number | null } | null;
  /** Votes: healthy (up) / less healthy (down). */
  up: number;
  down: number;
  updatedAt: number;
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

  /**
   * Live feed of a scope: every item (since = null) or only items the server
   * saved after `since` (ms), first what's there, then changes. Downloading
   * only what changed keeps far below Firebase's free daily read limit.
   */
  subscribe(scope: Scope, since: number | null, cb: (items: RemoteItem[], info: FeedInfo) => void, onError: (e: unknown) => void): () => void;
  put(scope: Scope, items: RemoteItem[]): Promise<void>;

  putPhoto(scope: Scope, fileName: string, dataUrl: string): Promise<void>;

  /** Shared food library: items changed after `since` (ms; 0 = all). */
  libraryFetch(since: number): Promise<LibraryItem[]>;
  /** Add or update a product's values (from a package label). */
  libraryPut(item: Pick<LibraryItem, 'key' | 'name' | 'brand' | 'barcode' | 'liquid' | 'per100'>): Promise<void>;
  /** Change the healthy / less healthy votes by +1 / -1 (moving one's own vote). */
  libraryVote(key: string, name: string, up: number, down: number): Promise<void>;
  getPhoto(scope: Scope, fileName: string): Promise<string | null>;
}
