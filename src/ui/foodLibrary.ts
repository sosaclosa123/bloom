// The food library shared by all Bloom users (owner, Nov 2026): products
// someone copied from a package label, and healthy / less healthy votes.
// Kept as a small cache on this device; only what changed is downloaded
// (at most every 10 minutes, and only while signed in). Never anything about
// who added or ate a food.
import { useEffect, useMemo, useState } from 'react';
import { libraryAsMine, voteDelta, type Votes } from '../shared/food';
import type { HealthMyProduct } from '../shared/types';
import type { LibraryItem } from '../sync/backend';
import { startSync } from './sync';

const KEY = 'bloom-food-library-v1';
const EVERY_MS = 10 * 60_000;

interface Cache {
  mark: number;
  at: number;
  items: Record<string, LibraryItem>;
}

function read(): Cache {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null') as Cache | null;
    if (c && typeof c.mark === 'number' && c.items) return c;
  } catch {
    /* ignore */
  }
  return { mark: 0, at: 0, items: {} };
}

let cache = read();
let version = 0;
const listeners = new Set<() => void>();
const write = () => {
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* full: it's only a cache */
  }
  listeners.forEach((l) => l());
};

let running: Promise<void> | null = null;
/** Download what changed in the shared library since last time. */
export function refreshLibrary(force = false): Promise<void> {
  if (running) return running;
  if (!force && Date.now() - cache.at < EVERY_MS) return Promise.resolve();
  running = (async () => {
    try {
      const engine = await startSync();
      if (!engine?.libraryOn) return;
      const items = await engine.libraryFetch(cache.mark);
      for (const x of items) cache.items[x.key] = x;
      cache = { ...cache, at: Date.now(), mark: Math.max(cache.mark, ...items.map((x) => x.updatedAt)) };
      write();
    } catch (e) {
      // e.g. the new Firestore rules aren't published yet: try again later.
      console.warn('bloom: food library unavailable', e);
      cache = { ...cache, at: Date.now() };
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Share a product's label values with all Bloom users (signed in only). */
export async function publishProduct(m: HealthMyProduct) {
  const item = { key: m.key, name: m.name, brand: m.brand, barcode: m.barcode, liquid: m.liquid, per100: m.per100 };
  const old = cache.items[m.key];
  cache.items[m.key] = { ...item, up: old?.up ?? 0, down: old?.down ?? 0, updatedAt: old?.updatedAt ?? 0 };
  write();
  try {
    const engine = await startSync();
    await engine?.libraryPut(item);
  } catch (e) {
    console.warn('bloom: sharing the product failed', e);
  }
}

/** Your healthy / less healthy choice for a food counts once for everyone. */
export async function voteFood(key: string, name: string, from: 'healthy' | 'less' | null | undefined, to: 'healthy' | 'less' | null | undefined) {
  const d = voteDelta(from, to);
  if (!d.up && !d.down) return;
  const old = cache.items[key] ?? { key, name, up: 0, down: 0, updatedAt: 0 };
  cache.items[key] = { ...old, up: Math.max(0, old.up + d.up), down: Math.max(0, old.down + d.down) };
  write();
  try {
    const engine = await startSync();
    await engine?.libraryVote(key, name, d.up, d.down);
  } catch (e) {
    console.warn('bloom: vote not sent', e);
  }
}

/** Votes and shared products, kept up to date while the screen is open. */
export function useLibrary() {
  const [v, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    void refreshLibrary();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return useMemo(() => {
    const votes = new Map<string, Votes>();
    const products: HealthMyProduct[] = [];
    for (const x of Object.values(cache.items)) {
      if (x.up || x.down) votes.set(x.key, { up: x.up, down: x.down });
      const m = libraryAsMine(x);
      if (m) products.push(m);
    }
    return { votes, products };
  }, [v]);
}
