#!/bin/bash
# Runs the sync tests against the real Firestore + Auth emulator with our
# security rules (src/sync/firebase.emu.test.ts). Needs Java.
# First time: npx -y firebase-tools@15.37.0 setup:emulators:firestore
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cp "$ROOT/firebase/firestore.rules" "$TMP/"
cat > "$TMP/firebase.json" <<'JSON'
{ "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "port": 8080 }, "auth": { "port": 9099 }, "ui": { "enabled": false }, "singleProjectMode": true } }
JSON
cd "$TMP"
npx -y firebase-tools@15.37.0 emulators:exec --project demo-bloom --only firestore,auth \
  "cd '$ROOT' && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 AUTH_PORT=9099 npx vitest run src/sync/firebase.emu.test.ts"
