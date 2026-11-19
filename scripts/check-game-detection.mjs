// Windows CI check: loads the real game-detection code (koffi + Win32 calls)
// outside Electron and makes sure it runs without errors.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(mkdtempSync(join(tmpdir(), 'bloom-')), 'gameMode.cjs');
await build({ entryPoints: ['electron/gameMode.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['koffi'], outfile: out, logLevel: 'error' });
const require = createRequire(join(process.cwd(), 'package.json'));
const mod = require(out);
const status = mod.gameDetectionStatus();
const gaming = mod.isGaming('auto');
console.log('platform:', process.platform, '| detection available:', status.available, '| error:', status.error, '| gaming now:', gaming);
if (process.platform === 'win32' && !status.available) {
  console.error('Game detection failed to load on Windows');
  process.exit(1);
}
