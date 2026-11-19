// Windows ignores letter case in file names: two files that differ only in
// case (e.g. stickers.ts / Stickers.tsx) break the Windows build.
import { readdirSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';
import { describe, expect, it } from 'vitest';

function clashes(dir: string): string[] {
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...clashes(full));
    const key = parse(name).name.toLowerCase();
    if (seen.has(key) && seen.get(key) !== name) out.push(`${dir}: ${seen.get(key)} / ${name}`);
    seen.set(key, name);
  }
  return out;
}

describe('file names', () => {
  it('have no case-only clashes (Windows-safe imports)', () => {
    expect([...clashes('src'), ...clashes('electron')]).toEqual([]);
  });
});
