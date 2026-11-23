# Bloom: full project summary (read this + CLAUDE.md, not old chats)

CLAUDE.md = the rules to follow. This file = what exists, why, what the owner
already chose or rejected, known pitfalls, and how to test. Keep it short and
up to date when something important changes.

## The product
- Pastel desktop calendar (Windows, Electron) made by the owner for his
  girlfriend. Two users: owner (English Windows), girlfriend (Hebrew Windows,
  plays full-screen games). App UI in English or Hebrew (RTL).
- Install: `Bloom-Setup-X.Y.Z.exe` from GitHub Releases (repo
  `sosaclosa123/bloom`, public). Every push to `main` = new release; installed
  apps auto-update. Starts with Windows, lives in the tray.
- Sync: Firebase project `bloom-cff50` (free plan), email login, a shared
  "space" for the couple. Private items sync only to the owner's own area.
- Data on disk: `%APPDATA%\Bloom\bloom-data.json` (+ `backups\`, `sounds\`).
  Program: `%LOCALAPPDATA%\Programs\Bloom`.

## Features (where to look)
- **Calendar** (`MonthView`, `WeekView`, `YearView`, `Header`): Month / Week /
  Year. Day squares with event pills, busy dot (green/yellow/red), Hebrew
  dates ("ט״ז בכסלו", toggle in top bar), holidays (@hebcal, Jewish/Christian),
  countdown labels, day headline (handwritten font: Caveat EN, Gveret Levin
  HE), chips (to-dos "1/3" opens a to-do popover above it; notes icon opens
  the note popover; bell). Hover buttons: sticker + note (always on top).
  Fit logic folds events into "+N more" and tightens in 3 levels so text is
  never cut (re-measures after fonts load). Year view: month color menu
  (wheel, pastel-only, hex). Clock pill (time · date) in top bar.
- **Events** (`editors.tsx`): title, color, all-day, start/end, notify
  (number 1-60 + unit up to months, up to 20), sound (collapsed), shared
  toggle, repeat none/daily/weekly/monthly/yearly/Hebrew-yearly + "every N".
- **Stickers** (`Stickers.tsx`, `stickerDesigns.ts`): ~50 SVG stickers, drag,
  resize, rotate, lock. Repeating stickers ride on an event (`event.stickers`,
  `from`, `skip`), switch "Repeat with …" on by default; edits ask "Only this
  day / All days".
- **Notes**: rich text with highlight brush (yellow, ==mark==), note popover.
- **Scheduled** (`Pages.tsx` UpcomingPage): "Coming up" (30 days, one-time
  items by day + each repeating event once on its next date with an "Every …"
  pill) | "Repeating" list. Re-checks every minute.
- **Countdowns**: cards with sticker art, yearly option, shown on calendar.
- **Wallet** (`Wallet.tsx`, `shared/money.ts`): Mine | Shared pages. Monthly
  limit vs spent, quick "What did you buy?", spending list, This-year card
  (12 bars), repeating payments & subscriptions (history per payment, price
  changes "from now on", cancelled shown dimmed with red X next month),
  savings goals (banknote-green fill; shared goals = per-person deposits).
  Layout C: two columns scrolling separately. Numbers font: Outfit.
- **Health** (heart tab, `Health*.tsx`, `shared/health.ts`): see CLAUDE.md.
  Always private; per-PC switches Health / IBD, default off.
- **Reminders** (`electron/scheduler.ts`, `popup.tsx`, `AlertCards.tsx`):
  popup never takes focus + Windows toast. Game mode (`electron/gameMode.ts`):
  D3D full-screen/presentation, or a non-maximized window covering the
  monitor; while gaming reminders wait silently, her sound plays at 65%.
- **Startup "Coming up" window** (`glance.tsx`): at login, next 5 events,
  mini day squares, on the Start button side (RTL Windows -> right).
- **Settings**: language, theme, text size, currency, week start, holidays,
  game mode, sounds, start with Windows, tray, startup window, backups folder,
  Health switches, account/sync.
- **Look**: "Earth & clay" month palette with 4-day blends, identical light
  and dark calendar, day lines = darker shade of each day, season particles
  (top bar + blurred backdrop, calendar follows shown month), logo = cream "b"
  with blush leaf on sage.

## Owner's choices (don't re-propose rejected options)
- Wants: short answers, question window, low-res demo before any design
  change, ~10 options when asking for ideas, very high QA.
- Fonts: hates "vintage" serif for numbers/titles in new UI -> Outfit.
  Month titles in calendar still use Fraunces (not complained about).
- Emojis -> sticker art everywhere (countdowns, wallet).
- Scheduled: rejected boxed "pill window" sections and table layouts; wants
  the current row look; no separate Shared section (people icon is enough).
- Palettes: no purple palettes; chose palette 3 (Earth & clay). Dark mode:
  rejected heavy gaps; chose thin darker lines (option A, shade of the day).
- Wallet: removed accounts/budgets/transactions; layout C; cancel button
  "Cancel subscription" / "בטל מנוי" (non-subscription: "Stop payment").
- Android app: Android only, free APK (no Play Store). Not built yet.

## Pitfalls already hit (and fixed)
- Hebrew Windows puts min/max/close at top-LEFT -> measured live
  (`windowControls.ts`); never assume a side.
- 1366x768 at 125% scaling: tiny day squares; hover buttons were under event
  pills (fixed with z-index); fit logic + tight levels.
- Fonts load late on slow PCs -> re-measure on `document.fonts` events.
- Electron with backgroundThrottling off reports a tray-hidden window as
  "visible" -> main sends `app:hidden`; animations pause.
- Day records could be shared from old versions -> `asPrivateDay`.
- CSS: `.a .b` doesn't match one element with both classes (use `.a.b`).
- Don't run prettier on whole files (huge diffs); edit surgically.
- Long-running `vite preview` gets killed by the session; `qa/run.sh` starts
  and stops it per run.
- Monthly->yearly switch used to keep charging monthly until the first yearly
  date; now old part ends after today, yearly starts at next payment.

## QA tools (`qa/`)
- `qa/run.sh <script…>`: builds, serves on :4173, runs browser scripts.
- `clip-check.cjs`: every screen x EN/HE x sizes x 125/150% scaling with slow
  fonts; reports cut/hidden text (pill-title "…" is by design).
- `sticker-buttons.cjs` (QUICK=1 for one size): hover buttons clickable.
- Desktop (after `npm run build`, run with `xvfb-run -a node qa/<file>`):
  `window-buttons.cjs` (buttons left/right x EN/HE), `reminder-fires.cjs`,
  `reminder-in-game.cjs`, `startup-window.cjs`.
- `sample-data.cjs`: shared sample data (today = Thu 19 Nov 2026 11:40).

## Timeline (short)
v0.1-0.2.x: core calendar, reminders + game mode, sync, auto-update, journal
(later removed), wallet v1 -> Year view, Hebrew dates, new logo, text size,
stickers + repeating stickers, notes popover, Wallet v2 (limit, payments,
goals, history), Scheduled redesign, countdown stickers, startup window,
window-buttons fix, privacy fix for day info, Health tab + IBD, automatic
backups (v0.2.47 at the time of writing).
