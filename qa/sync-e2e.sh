#!/bin/bash
# Real app + real sync on the local Firebase emulator (PC window + phone window).
# Usage: qa/sync-e2e.sh            (LANG_UI=he qa/sync-e2e.sh for Hebrew)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cp "$ROOT/firebase/firestore.rules" "$TMP/"
cat > "$TMP/firebase.json" <<'JSON'
{ "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "port": 8080 }, "auth": { "port": 9099 }, "ui": { "enabled": false }, "singleProjectMode": true } }
JSON
mkdir -p "$ROOT/qa/shots"
(cd "$ROOT" && npx vite --port 5173 --strictPort >/dev/null 2>&1 &)
for i in $(seq 1 60); do curl -s localhost:5173 >/dev/null && break; sleep 0.5; done
cd "$TMP"
set +e
npx -y firebase-tools@15.37.0 emulators:exec --project demo-bloom --only firestore,auth "cd '$ROOT/qa' && node sync-e2e.cjs" 2>&1 | grep -E "^(OK|FAIL)|sync-e2e|ERR"
code=${PIPESTATUS[0]}
pkill -f "vite --port 5173" || true
exit $code
