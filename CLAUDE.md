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
- **Check-in pauses (owner's rule for big jobs):** about every 15-20 minutes
  of work, stop at a SAFE point and ask with AskUserQuestion "Continue?"
  (options: "Yes, continue" / "Yes, continue (after a break)"). Owner will say
  yes; the pause is only so usage doesn't run out mid-change.
  A safe point means: the code builds, tests pass, nothing half-edited;
  commit + push to the work branch (`claude/...`). Push to `main` (= a
  release) only when a finished, tested piece is ready, never a half-done one.
  Before each pause, update "In progress" below with a checklist (done / next
  step / any gotchas) so a new session can pick up exactly there.

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
- **Android app** (Capacitor 8, `android/`, `capacitor.config.json`): same
  `src/` web code. `src/platform/android.ts` = phone storage (files),
  notifications, share sheet, updates; `src/ui/phone.tsx` + `src/theme/phone.css`
  = phone layout (everything scoped to `.phone`). Native helper:
  `android/app/src/main/java/app/bloom/calendar/BloomNativePlugin.java`.
  Plan/notes: `ANDROID_PLAN.md`.
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
- Phone layout check: `qa/run.sh phone.cjs` (browser with `?phone`; EN/HE,
  light/dark, 360/412 wide; shots in `qa/shots/phone-*`),
  `phone-menus.cjs` (opens every menu/pop-up/window at 320/360/412 wide and
  fails if any part is off screen or covered), `phone-fps.cjs` (frame rate of
  the phone animations with the CPU slowed 4x).
- Electron tests: Playwright `_electron`, `xvfb-run`, env `BLOOM_USER_DATA`
  for a temp data folder; `--hidden` = launched at login, `--glance` forces
  the startup window.

## Release
Push to `main` = new release. CI (`.github/workflows/build.yml`) builds
`Bloom-Setup-X.Y.<run>.exe` + `latest.yml` and publishes the GitHub release;
installed apps auto-update. The `android` job builds `Bloom-X.Y.<run>.apk`
(signed with the key in GitHub secrets `ANDROID_KEYSTORE_BASE64` +
`ANDROID_KEYSTORE_PASSWORD`; never change the key or phones can't update)
and `android-release` attaches it to the same release. No Android SDK in the
cloud container: test APK builds with workflow_dispatch on the work branch. Commit messages: clear "what + why".

## Rules decided with the owner (don't break these)
- **Private by default.** Sharing is opt-in per item.
- **Security rules** (`firebase/firestore.rules`) are NOT deployed by CI: the
  owner pastes them in the Firebase console (Firestore → Rules → Publish).
  A full couple space is invisible to outsiders (get only for members or
  while it has < 2 members); a join to a full space reads as "full".
- **Data follows the account** (owner's rule): signed in = that account's
  data (calendar, Health, Wallet, everything synced) on any PC; signed out =
  this computer's own offline Bloom. Desktop files: `bloom-data.json`
  (offline) and `accounts/<uid>.json` (working copy of the account);
  `profile.json` remembers which is open so start-up shows the right one.
  Sign-out uploads everything first (`engine.flush()`; asks before losing
  unsynced changes), then deletes the account copy (`switchProfile(null,
  uid)`), so account data lives only online + in backups. Restoring a backup
  while signed out shows it in the offline data. First sign-in after this
  change adopts the old single file as the account's copy. Account settings
  offer "Add this computer's offline items to my account". Tests:
  `src/sync/profiles.test.ts`.
- **Settings follow the account** (owner, Nov 2026): language, theme, week
  start, holidays, Hebrew dates, default reminder, snooze, currency, month
  colors and every Health switch sync through one private document
  (`ACCOUNT_SETTINGS` in `src/sync/engine.ts`). Per device: text size, start
  with Windows, tray, startup window, game mode, volume, sound, backup folder.
  First sync: a PC's settings beat a new phone's defaults; afterwards the
  newest change of each setting wins. Tests: `src/sync/prefs.test.ts`.
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
- Health settings are **default OFF** and follow the account (see above):
  `healthEnabled`, `healthIbd`, `healthMedNames`. Rail heart tab always visible, dimmed when off
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
- **Food v5**: Meals / Snacks / **Drinks** (no water; water stays on Today, a
  small water card sits under the calories). Search shows real products first
  ("coke" -> Coca-Cola), general foods below (`ALIASES` in `src/shared/food.ts`).
  Tags (fried, sugary…) are auto-picked and editable in a foldable list; every
  logged item opens an editor (amount re-calculates calories).
- **Food amounts: Grams | Pieces | Part of box** (foods, not drinks). Owner
  chose "free, no AI" (no photo AI). One piece's weight, in order: "My box"
  (box weight ÷ pieces, asked once, remembered per product as a private
  `foodpack` health record) > product data (MoH "piece" portion, Open Food
  Facts serving like "3 biscuits (30 g)") > typical weight (shown "≈",
  "typical estimate"). Box weight: yours > MoH package portion > OFF
  `product_quantity`. Logic: `pieceWeight`/`packWeight` in `src/shared/food.ts`.
- **"Show as" name**: search results keep the full product titles; after
  picking, a "Show as" box (e.g. "XL") sets the name shown in the day
  (`text`); the full title is kept in `product` and shown in the editor.
  The last "show as" name for that product comes back next time.
- **Food rows = table "C"** (owner, Nov 2026; `FoodTable` in HealthFood.tsx):
  meal | food + amount | kcal | protein | edit, units once in the header,
  rows share columns (subgrid). Narrow (card < 360px, phone): no meal column,
  "Breakfast · 200 g" under the name. Used by Food tab meals, Today's log, day
  pop-up. Snack/drink chips keep "kcal · N g protein" on one line.
- **Protein shown like calories** (owner, Nov 2026): every food line shows
  its protein; day totals (Today's log tile, Food today card,
  Food tab total, day pop-up). Filled in from the product; the food editor
  has a "Protein (g)" box to correct it (saved per 100 g too, so changing the
  portion keeps the correction); typed-in foods can get protein when added.
- Picked food/drink shows as a **nutrition label** (owner chose design C):
  name + brand, amount pill, big Calories line, protein / carbs (sugars) /
  fat / fiber for the amount, per-100 g line, source (`NutritionLabel`).
- IBD "Other problems today" has a "Something else…" box for any custom
  problem (shown in the report; not counted in HBI).
- Medicines tab: under the list, **one "Taken / not taken" card per medicine**
  (no picker), headline = medicine name, own range (30 / 90 days / year /
  from the start) and a "Mark taken today" button for the chosen day only
  (marks all its planned doses; click again = undo). Same `taken` records as
  the Today ticks, so both stay in sync.
- **Today = the lobby** for the chosen day: "Quick add" side-scrolling row
  (mouse wheel scrolls it) at the top: Meal, Snack, Drink, Steps, Exercise,
  Weight, Bathroom (IBD only), Medicine, Test result, Doctor visit. Each opens
  the same editor as its tab (no leaving Today) and saves the same records
  (`src/ui/HealthQuick.tsx`). Steps/exercise add to the day; no steps goal
  (owner's choice).
  Under the medicines: **"Today's log"** (owner chose A, grouped): totals
  (kcal, water, steps, medicines taken/due), then Food & drinks, Body, Tests &
  visits for that day; click any line = its editor (same records).
- **Calorie goal lives in the Food tab only** (owner's choice): the History
  card shows goal + protein goal (with "Change"), a dashed goal line and a
  dotted "keep weight" line on the Calories chart (protein chart: protein
  goal line), and avg a day / vs. burn / about kg a week for the range
  (days with no food logged are skipped). Goal + pace are also questions in
  the health questionnaire. `PROFILE_VERSION` (HealthProfile.tsx): raising it
  asks everyone the questions again (answers kept); 2 = goal added.
- Food tab side: **History** line chart (same `LineChart`): Calories /
  Carbohydrates / Fat / Protein per day; Week / 30 / 90 days / Year / From the
  start; click a dot = day pop-up (`foodSeries` in healthExtras.ts).
- Icons: only names in `paths` (common.tsx) exist (pencil = "pen"); a missing
  name type-checks but draws nothing.
- **Doctor visits = full history**, never filtered by the chosen day, scrolls
  when long; each visit can hold documents (PDF/images): sticker icon + count
  when attached, plus icon when not. Big PDFs (> ~700 KB) stay on this PC +
  backups, they don't sync online.
- Trends: hover a dot = its date; click = day summary pop-up (blurred
  background): check-in, water, medicines, food, body, tests, IBD only when
  on, visit documents only if any (`src/ui/HealthDay.tsx`).
- **Less text in Health**: explanations are hover tips (`Tip`, shows after
  1.3 s), not lines on screen; safety notes (red flag, stoma/ORS) stay visible.
  IBD "Other problems today" is folded (button shows how many are picked).
  IBD history: 30 / 90 days / year / from the start (no limit); it is the
  same line chart as Trends (dots + dashed trend, click = day pop-up) with
  Overall (average of pain, feeling, tiredness and flare score, 0-10) | Belly
  pain | Feeling | Tiredness | Flare score (dotted "flare from" line: HBI 8,
  SCCAI 5); higher = worse on every line (`ibdSeries` in healthExtras.ts).
  **Every chart line in Health uses the same `LineChart`.** Hebrew day
  label uses the modern sans font.
- **Doctor report**: 30 days default; 1 week / 90 days / any dates. Summary
  boxes, week-by-week table (IBD: bowel movements/day, loose/day, blood days,
  feeling, pain, tiredness, flare days; otherwise water/sleep/mood), other
  symptoms with first date + days, flare day ranges, bowel movements per day
  (<= 31 days), meds taken of planned, weight, tests, visit questions. Printed
  from a clean hidden frame (white page) so "Microsoft Print to PDF" works.
  Logic: `reportData` in `src/shared/healthExtras.ts` (tested).
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
  - Crohn's: Harvey-Bradshaw (<5 / 5-7 / 8-16 / >16); the belly-lump (mass)
    item was removed at the owner's request and counts as 0; note that it
    isn't validated with an ileostomy.
  - UC: SCCAI (Walmsley 1998) from the bathroom log (day/night count,
    urgency, blood none/trace/obvious) + well-being + 4 extra-intestinal items;
    <=2 calm, 3-4 mild, >=5 active.
  - Red-flag note (blood, severe pain, fever, dehydration -> doctor today).
    Sleep line = 7 h (adults 7+). Always "Not medical advice".
  - **Calorie + protein goal** (owner, Nov 2026; `energyGoal` in health.ts,
    tests `energy.test.ts`): Mifflin-St Jeor BMR (Frankenfield 2005: most
    accurate) x PAL from FAO/WHO/UNU 2004 (mostly sitting 1.40, a little
    1.55, active 1.85, very active 2.20). Goals: Lose fat (חיטוב) -250 /
    -500 / -750 kcal a day (AHA/ACC/TOS 2013), max ~1% body weight a week
    (Helms 2014), floor 1200 women / 1500 men (1350 other); Keep weight
    (ללא שינוי) = burn; Build muscle (מסה) +10% / +20% (Iraki 2019);
    Recomp (רה-קומפוזיציה) = burn (Barakat 2020). Protein 0.8 g/kg keep
    (RDA), 1.6 g/kg other goals (Morton 2018). Under 18 -> keep only; BMI
    < 18.5 -> no fat-loss goal; IBD -> "set with your doctor" note.
    kg/week shown as "about" (7700 kcal/kg; Hall 2011 caveat).

- **Android app (owner's choices):** both of them install it (she in Hebrew).
  Everything from the PC app, same icons/stickers/colors, phone layout:
  bottom tabs (Calendar, Scheduled, Countdowns, Wallet, Health), gear + search
  on top, Month/Week/Year + Hebrew-date + Today on a 2nd row. Calendar
  "combo": full month with short event names; tap a day -> month shrinks to
  small squares with color dots and the day panel shows underneath (not a
  popup); close with X, the same day again, or swipe the panel down; smooth
  animation. Swipe sideways = next/previous month. "+" button = new event.
  Windows open as bottom sheets. Android back button closes the top thing.
  Reminders = Android notifications scheduled a month ahead (water nudges 2
  days), rescheduled on every change; "Taken" / "Snooze" buttons. Update =
  "Update available" banner -> downloads the APK, Android asks "Install?" (no
  silent updates, no Play Store). Same account = same data. PC-only parts are
  hidden on the phone (game mode, tray, start with Windows, startup window,
  folder backups, custom reminder sounds). Backup "Save" = share sheet.

## In progress
- Calorie + protein goal: built + tested on the work branch, NOT released.
- Health redesign (owner chose, Nov 2026) - built, QA NOT done yet:
  - [x] Tabs: Today | Food | Medicines | Body (Body & tests + Trends) | IBD | Goals
  - [x] Today = layout A: TodayTiles (kcal / protein / water / meds vs goals),
        check-in, medicines, TodayFoodCard (one list, "+ Add food" window
        with My meals chips), TodayBodyCard. Quick add + Today's log + Food
        today card removed (HealthQuick.tsx).
  - [x] Food: ONE "Add food" box with pill choice (Meal / Snack / Drink /
        Healthy / Treat / Fast food), one list of the day with a pill per line
        (tap = change), My meals chips + My meals card.
  - [x] My meals: `recipe` health records (fixed foods + amounts), Create /
        Edit meal window, "+ Eat" adds ONE food line with `recipe` (foods
        inside, portions x0.5-3). Logic + tests: food.ts / recipe.test.ts.
  - [ ] NEXT: QA screenshots PC + phone, EN/HE, light/dark; phone-menus.cjs
        (adds new windows), clip check; then show owner; release together
        with the calorie goal when the owner says.
- Owner rule: every feature always goes to BOTH the PC and the phone app.

## Open ideas
- (none right now)
