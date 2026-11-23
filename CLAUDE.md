# Bloom: project notes

> Start here, then read `docs/HISTORY.md` (full summary: features, owner's
> past choices, pitfalls, QA tools in `qa/`). Don't re-read old chats.

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
  holidays (@hebcal), money, schedule, health). Unit-tested; no DOM here.
- `src/ui/` React UI. `store.tsx` = state + save/del. `season.tsx` = month
  colors/particles. `Stickers.tsx` + `stickerDesigns.ts`. `Wallet.tsx`.
  Health: `Health.tsx` (page + settings), `HealthProfile.tsx` (questionnaire),
  `HealthCheckin.tsx`, `HealthCards.tsx` (meds/body/tests/visits),
  `HealthIbd.tsx`, `HealthTrends.tsx` (trends/flares/food), `HealthExtras.tsx`
  (goals, challenges, sticker book, monthly summary, doctor report), `healthUi.tsx`.
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
- Scheduled tab: two sections side by side, "Coming up" (next 30 days: all
  one-time items by day, plus each repeating event ONCE on its next date with
  an "Every …" pill; shared ones carry the people icon; re-checks every
  minute so finished items drop off) | "Repeating" (each
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
- **Health tab is always private.** `health` collection: visibility forced to
  'private' on save/load/merge (`asPrivateHealth`); the sync engine only puts it
  in the person's own area (`ALWAYS_PRIVATE`) and ignores any found in a shared
  calendar (test: `src/sync/health.test.ts`). No share toggle. Never shown in
  Search, the calendar, Scheduled (a doctor visit adds a private calendar event
  only if asked).
- Health settings are **per computer, default OFF**: `healthEnabled`,
  `healthIbd`, `healthMedNames`. Rail heart tab always visible, dimmed when off
  ("Health is off · Turn on in Settings"). Her PC keeps both off.
- **IBD off = every IBD part completely hidden** (IBD card, flare timeline, food
  insights, IBD tests like calprotectin, IBD profile questions, symptoms trend).
  IBD cards use the soft pink tint + "IBD" tag.
- Medication reminders use the normal scheduler, only where Health is on; text
  is just "Medication" unless "Show medicine names" is on; popup has "Taken".
- Health profile questions: the "Your health profile" card stays on the Health
  page until the questions are gone through to the end (`completed`); closing
  early keeps it ("2 of 10 answered" + Continue, resumes at the first
  unanswered). Turning IBD on later brings it back for the IBD questions.
- **Health design A** (approved): "Today" tiles (water wide with − / + glass;
  mood, sleep, energy·stress open a small popover), medications as
  Scheduled-style rows with a sticker per medicine and a tick, IBD card always
  open with a side minimize button (remembered per computer) and one-tap
  Bristol quick log. Cards use sticker art in their headers. Weight chart
  (trend line) and test history chart are hidden behind show/hide buttons.
- Health extras: medicines can repeat every N days/weeks/months (next date
  shown, reminders only on due days); sleep = hours by default, per day can
  switch to bed/wake times; visit questions checklist; Doctor report (30/90
  days, print / PDF, IBD parts only when IBD on); streak chips; monthly
  summary card (first week of a month). Settings > Health, all OFF by default:
  water reminders (even pace over waking hours, ~one glass per nudge, none in
  the last 1.5 h before bed, dropped while gaming), weekly weigh-in day, My goals
  (N times every N days/weeks/months, stays done until the next period),
  7-day challenges, Achievements book ("הישגים"; dimmed book button in the Health top bar;
  22 families / 120+ badges from day 1 to 5+ years; IBD ones only with IBD).
  Logic in `src/shared/healthExtras.ts` (tested).
- **Health layout = tabs inside Health** (owner chose option A): Today
  (check-in, meds today, IBD card, food summary) | Food | Medicines | Body &
  tests (About you, Body, Tests, Visits) | Trends | IBD (only with IBD) |
  Goals (only if goals/challenges on). Last tab remembered per computer.
- Trends = line chart, a dot per logged day joined by a line, dashed trend
  line, goal line; Week / Month / Year / From the start.
- Body is pre-filled from the health questions / last weight; the
  questionnaire's weight is also saved to today's Body log. Settings > Health
  has "Start again" for the questions (opens Health + questions from the start).
- **Food tab**: Meals (breakfast/lunch/dinner + IBD food tags) and a separate
  Snacks area; calories + protein/carbs/fat per portion; day total.
  Offline (default): built-in Israeli Ministry of Health national nutrition
  database (`src/data/foods-il.json`, 4,600+ foods incl. Israeli brands,
  rebuilt by `scripts/fetch-foods-il.mjs`, lazy-loaded chunk). Setting
  "Online food search" (default OFF) adds Open Food Facts search and barcode
  lookup (webcam / typed number / photo, @zxing/browser); only the search
  word or barcode is sent; free, no AI. OFF search is rate-limited (~10/min):
  the app shows "busy, try again" instead of failing.
- Startup window: shows today's remaining medication doses only when Health is
  on; never any IBD item.
- **Automatic backups** (Settings > Backup, desktop only): per-computer
  `backupFolder` (e.g. OneDrive); weekly (checked at start-up, every 3 h and on
  wake) the current data file (everything, Health too) is copied there as
  `bloom-backup-YYYY-MM-DD.json`; keeps the newest 8 of those files and never
  touches other files; shows "Last backup" or a clear error. Logic:
  `src/shared/backup.ts` (tested), `electron/autoBackup.ts`.
- Health formulas live in `src/shared/health.ts` with sources in comments.
  Researched with the owner's OK; don't change without new sources:
  - **Water = drinks goal from EFSA 2010** (80% of adequate total water):
    women 1.6 L, men 2.0 L, children by age; **body weight is NOT used**
    (35 ml/kg gave ~4 L). + ~500 ml/h exercise (max +1 L), + 500 hot days,
    IBD: ileostomy/J-pouch + 500 with
    oral-rehydration + high-output-stoma warning, colostomy nothing, loose
    stools + 200 each (max + 1 L, ORS tip). Clamp 1.2-3.5 L; doctor's limit wins.
  - BMI: WHO adult bands, neutral wording, no band under 18.
  - **Nothing pregnancy-related anywhere in Health** (owner's rule).
  - Crohn's: Harvey-Bradshaw (<5 / 5-7 / 8-16 / >16); mass item "only if a
    doctor found one"; note that it isn't validated with an ileostomy.
  - UC: SCCAI (Walmsley 1998) from the bathroom log (day/night count,
    urgency, blood none/trace/obvious) + well-being + 4 extra-intestinal items;
    <=2 calm, 3-4 mild, >=5 active.
  - Red-flag note (blood, severe pain, fever, dehydration -> doctor today).
    Sleep line = 7 h (adults 7+). Always "Not medical advice".

## In progress
- Nothing right now. Health tab + automatic backups are done (all boxes in
  `HEALTH_PLAN.md` ticked).

## Open ideas
- **Android app** (owner wants Android only, free install via APK, no Play
  Store): Capacitor wrapper reusing the web code, same Firebase sync, local
  notifications, APK built in CI and attached to releases, in-app "Update
  available". Do it in a fresh session with enough usage.
