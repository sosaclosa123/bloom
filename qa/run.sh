#!/bin/bash
# Usage: qa/run.sh clip-check.cjs sticker-buttons.cjs   (browser tests; builds first)
# Desktop (Electron) tests: npm run build && xvfb-run -a node qa/window-buttons.cjs
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" && npm run build >/dev/null
mkdir -p "$ROOT/qa/shots"
(npx vite preview --port 4173 --strictPort >/dev/null 2>&1 &)
for i in $(seq 1 40); do curl -s localhost:4173 >/dev/null && break; sleep 0.25; done
cd "$ROOT/qa"; for s in "$@"; do node "$s"; done
pkill -f "vite preview --port 4173" || true
