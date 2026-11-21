# Bloom: project notes

A pastel desktop calendar for Windows, made for the owner's girlfriend.
Used daily by two people (owner: English Windows; she: **Hebrew Windows**).
Keep this file updated whenever something important changes.

## How to work with the owner
- **Short, simple answers.** Reading a lot is hard for them. Bullets, no walls of text.
- **Ask questions with the question window** (AskUserQuestion), not in plain text.
- **Design changes: show a low-res demo image first, then ask**, then build.
  Offer ~10 options when they ask for ideas.
- **High quality control, no bugs.** Test every change in the real app
  (browser + desktop/Electron), both languages, light/dark, several window
  sizes and Windows scaling. Look for cut/hidden text. Report honestly.
- Usage is limited: work efficiently; prefer one solid pass over many small ones.

## Stack
Electron + React 18 + TypeScript + Vite; esbuild for main/preload
(`scripts/build-electron.mjs`); vitest. Sync: Firebase (project `bloom-cff50`).
Auto-update: electron-updater from GitHub Releases.

- `src/shared/` pure logic (types, db + migrations, recurrence, alerts,
  holidays (@hebcal), money, schedule). Unit-tested; no DOM here.
- `src/ui/` React UI. `store.tsx` = state + save/del. `season.tsx` = month
  colors/particles. `Stickers.tsx` + `stickerDesigns.ts`. `Wallet.tsx`.
- `src/glance.tsx` startup "Coming up" window. `src/popup.tsx` reminder popup.
- `electron/` main process: windows, tray, scheduler (fires reminders),
  game-mode detection, file store, updater.
- `src/i18n/strings.ts` all text, English + Hebrew (RTL). Every new string
  needs both.
- Theme tokens in `src/theme/tokens.css`; styles in `app.css`; animations
  `motion.css`. Font sizes use `calc(Npx * var(--fs-scale))`.

## Commands
- `npm run build` (typecheck + web + electron), `npx vitest run`
- Preview for browser tests: `npx vite preview --port 4173`
- Electron tests: Playwright `_electron`, `xvfb-run`, env `BLOOM_USER_DATA`
  for a temp data folder; `--hidden` = launched at login, `--glance` forces
  the startup window.

## Release
Push to `main` = new release. CI (`.github/workflows/build.yml`) builds
`Bloom-Setup-X.Y.<run>.exe` + `latest.yml` and publishes the GitHub release;
installed apps auto-update. Commit messages: clear "what + why".

## Rules decided with the owner (don't break these)
- **Private by default.** Sharing is opt-in per item.
- **Day info (busy dot, notes, to-dos, stickers) is always private.** Saves go
  to the person's own private day record (`asPrivateDay`); the UI shows one
  record per date (`personalDays`). Never edit a shared day record.
- **Window buttons can be on either side**: Hebrew Windows puts them top-LEFT.
  `src/ui/windowControls.ts` measures them live; never assume a side.
- **Calendar look is identical in light and dark**; day lines are a slightly
  darker shade of each day's own color.
- Month colors: "Earth & clay" palette, 3–4 day blend between months, custom
  color per month in Year view.
- **Season particles**: calendar follows the month on screen; other pages
  follow today's season. Blurred backdrop + soft top-bar layer. Animations
  pause when the app is hidden in the tray.
- **Wallet**: Mine = private only; Shared page = shared items only.
  Monthly limit vs. purchases + repeating payments. **Yearly payments count
  only in their charge month.** Cancel keeps already-paid charges. Price or
  monthly<->yearly changes apply "from now on" (old part ends after today,
  history kept). A cancelled payment shows once, dimmed with a red X and a
  "Cancelled" pill (not counted, not clickable), on the charge that no longer
  happens. Shared goals: each deposit is its own record (sync-safe).
  Goal cards fill with banknote green, animate only when money is added.
  Layout: two columns that scroll separately (this month | year, goals,
  payments); one column on narrow windows. Money numbers use the Outfit font.
- **Repeating stickers** follow their event from the day added; editing asks
  "Only this day / All days".
- Scheduled tab: two sections side by side, "Coming up" (all one-time items
  by day; shared ones just carry the people icon) | "Repeating" (each
  repeating event once, "Every 2 weeks · next …"), each scrolling on its own,
  same row look as before; multi-day events once with "until …".
- Countdowns show on their date (yearly ones every year; 29 Feb -> 28 Feb)
  and use sticker art, not emoji (same for Wallet goals and payments).
- Reminders must never pull her out of a full-screen game (game mode;
  popups never take focus). Reminders also post a Windows notification.
- Startup "Coming up" window: next 5 events, on the Start button's side,
  stays until closed, setting to turn off (default on).
- Text size setting (small/medium/large); day squares never cut text
  (fit logic folds events into "+N more").

## Open ideas
- **Android app** (owner wants Android only, free install via APK, no Play
  Store): Capacitor wrapper reusing the web code, same Firebase sync, local
  notifications, APK built in CI and attached to releases, in-app "Update
  available". Do it in a fresh session with enough usage.
