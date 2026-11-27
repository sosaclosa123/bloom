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
- Health redesign check: `qa/run.sh health-redesign.cjs` (Today, Food, Body,
  pills, Add food, Create meal + Eat; PC + phone, EN/HE, light/dark).
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
- **Settings follow the account** (owner, Nov 2026): language, week start,
  holidays, default reminder, snooze, currency, month colors and every Health
  switch sync through one private document (`ACCOUNT_SETTINGS` in
  `src/sync/engine.ts`). **Look is per device** (round 3): text size,
  light/dark, Hebrew dates; also start with Windows, tray, startup window,
  game mode, volume, sound, backup folder. While signed in, changing an
  account setting asks "All my devices / Only this device" (+ "Don't ask
  again"; `SettingsAsk.tsx`, `settings.localKeys` / `askOff`; the engine skips
  local keys both ways). First sync: a PC's settings beat a new phone's
  defaults; afterwards the newest change of each setting wins. Tests:
  `src/sync/prefs.test.ts`.
- **Sync reliability** (owner, Nov 2026: phone changes never reached the PC):
  every item gets a server save time (`serverAt`); listeners download only
  what changed since the last one (`marks` per area), a full download every
  12 h / first time / "Sync now" (Account tab: status, "last HH:MM", error
  text). Firebase free tier = 50k reads/day: never re-download everything on
  every resume. A stopped listener (quota, expired sign-in) listens again by
  itself (5 s -> 10 min backoff). Re-listen on resume (>15 s hidden), on
  `online`, after sleep (clock jump) and every 10 min. Push on hide
  (`flush`). One refused record never blocks others (shown as "refused: …");
  a failed photo only holds back its own entry. Tests: `src/sync/reliable.test.ts`,
  `delete.test.ts`; real Firestore emulator + rules: `qa/sync-emulator.sh`;
  real app PC + phone windows on the emulator: `qa/sync-e2e.sh` (LANG_UI=he).
  Dev-server-only switches (stripped from builds): `qa-emulator`, `qa-signed-in`.
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
- **One reminder per series** (owner, Nov 2026): water, the same medicine,
  the same event (`seriesOf`). A new one while the last is still unanswered
  replaces it and shows "Missed N" (`stackAlerts` in src/shared/alerts.ts,
  tests `stack.test.ts`). PC: one pop-up card + the Windows notification is
  replaced. Phone: `StackReceiver.java` (alarm ~3 s after each fires) removes
  the older ones from the shade and updates the newest ("Missed N"), its
  buttons keep working; the app sends the series via `setStacks`.
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
  water reminders (even pace, ~one glass per nudge, only between the set
  hours: default 09:00-00:00, `healthWaterFrom`/`healthWaterTo`, account
  setting; dropped while gaming), weekly weigh-in day, My goals
  (N times every N days/weeks/months, stays done until the next period),
  7-day challenges, Achievements book ("הישגים"; dimmed book button in the Health top bar;
  22 families / 120+ badges from day 1 to 5+ years; IBD ones only with IBD).
  Logic in `src/shared/healthExtras.ts` (tested).
- **Health layout = tabs inside Health** (redesign, owner Nov 2026): Today |
  Food | Medicines (+ Visits) | Body (Body, Trends, Tests, About you, month
  summary) | IBD (only with IBD) | Goals (only if goals/challenges on). Last
  tab remembered per computer (old "trends" opens Body).
- **Today = layout A** (owner): `TodayTiles` (kcal / protein / water / meds
  vs goals), check-in, medicines today, `TodayFoodCard` (one list of the day,
  "+ Add food" window = Add box + My meals chips), `TodayBodyCard` (steps,
  exercise, weight + that day's tests/visits); side: monthly summary, IBD
  card. **No Quick add row, no Today's log, no Food today card** (removed
  at the owner's request: they overlapped).
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
- **Food tab** (redesign, owner Nov 2026): ONE "Add food" box; the food's
  **pill** is picked in it: Meal / Snack / Drink / Healthy / Treat / Fast food
  (`label`; old items get one from meal/snack, `labelOf`). ONE list of the
  day with the pill on every line (tap = change). Drink pill = ml amounts,
  no water (water stays on Today). Time of day (breakfast/lunch/dinner) is
  kept automatically from the clock, not asked.
- **My meals** (owner): fixed meals = `recipe` health records (name, pill,
  foods + amounts). "Create meal" window: search/add foods, change amounts,
  totals (kcal, protein, grams, carbs, sugars, fat). "+ Eat" / the chips add
  it as ONE food line with its name (`recipe`: foods inside, portions x0.5-3
  in its editor). Logic: `recipeTotals`/`recipeFood` in food.ts (tested).
- Food v5 (older, still true where not replaced above): Search shows real products first
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
  pill | food + amount | kcal | protein | edit, units once in the header,
  rows share columns (subgrid). Narrow (card < 360px, phone): the amount goes
  under the name, the pill stays. Rows you tap are divs (not buttons: the
  pill inside is a button). Used by the Food tab, Today, the day pop-up.
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
- No steps goal (owner's choice).
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
- **Calorie balance card** (owner chose the demo, Nov 2026; Food tab side,
  under History): per day eaten minus burn (+ surplus = gaining, - deficit =
  losing); today so far vs burn + goal pill; yesterday; line chart (0 = keep
  weight dotted, goal dashed); avg a day, about kg/week, days counted. Green
  = good for the goal. **Today and days under 40% of burn logged are left
  out of averages** (owner chose; that was why "vs. burn" looked too high);
  the History summary uses the same rule (`calorieBalance`, `energySummary`,
  `LOW_DAY_SHARE` in health.ts, tests energy.test.ts).
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
  Phone weekly auto backup (default ON, Settings > Backup can turn it off):
  Documents/Bloom (fallback: the app's own folder), newest 8 kept.
  Stickers scale with the phone's day squares (`Stickers.tsx`).
  **Phone animations = transforms/opacity only** (round 3 root cause: the
  month resized + the season particles animated `top`, so the whole page was
  re-laid out every frame). Day panel: rows slide up (`--row`/`--shrink`),
  panel slides over (`--sheet-top`). Month/week/year swipe follows the finger
  (`useSwipe` in phone.tsx; 25% or a flick, RTL aware). Never animate
  layout properties on the phone. Checks: `qa/phone-fps.cjs`.
  **Phone Wallet = layout A** (owner): tabs This month | Year | Savings |
  Payments (remembered), "+ Purchase" opens the purchase window; the PC
  Wallet keeps its two columns. Check: `qa/phone-wallet.cjs`.
  **Keyboard** (target SDK 36 = edge-to-edge, `adjustResize` alone doesn't
  help): `useKeyboard` (phone.tsx) + native `bloomKeyboard` event (how much
  the keyboard covers): `kb-open` on <html>, tabs/+ hide, windows sit above
  the keyboard, the day panel fills the page while typing in it, the box is
  scrolled into view. Check: `qa/phone-keyboard.cjs` (resize + overlay).

## In progress
- Round 4 released (0.2.74). Keyboard + "Missed N" only simulated: ask the
  owner how they behave on the real phone.
- **Round 5 = Food upgrade (owner chose, Nov 2026; NOT started, owner wants
  to explain one more feature first, then build all together).** Every
  part must be really accurate and logical (owner). PC + phone.
  - ml for drinks AND liquid foods (e.g. Modulen), not only grams.
  - Healthy / not healthy: auto by logic first (Nutri-Score-style from the
    MoH data: sugars, sat fat, sodium, fiber, protein; refetch with
    `saturated_fat`, `sodium` from data.gov.il), separate small mark next to
    the pill (green "Healthy" / orange "Less healthy"), tap to change; a
    correction is remembered and shared with all Bloom users (only food
    name + healthy/not, never who/when).
  - Accuracy: cups/spoons/slices (MoH portions in foods-il.json `units`),
    copy from package label (still look up the product data first; label
    edits = "my product"), cooking-oil quick add, exact-mark per line
    (weighed/label/barcode = exact, pieces/typical = "≈") + day ± range.
  - Knowledge: shared product library (all users, name + nutrition only),
    bigger offline DB (Israeli Open Food Facts products with barcodes,
    built in), online search ON by default, phone camera barcode scan.
  - Features: recent + favorites first, repeat a meal / copy a day, macro
    goals (carbs/fat split from the calorie goal), Israeli red-label marks
    (sugar/salt/sat fat) + day count, weekly food report, fiber + sugar
    goals (fiber 25-30 g; WHO free sugars < 10% kcal), eating out S/M/L
    (typical weights, "≈").
  - Shared data needs new Firestore rules (owner pastes them) + a design
    demo before building.
- **Round 5 also = Recipes / Kitchen (owner, Nov 2026; build TOGETHER with
  the Food upgrade, one release; check-in pause every ~15 min).** NO AI:
  built-in recipe database + rules (filters + scoring), offline. Recipes
  are original (no copying sites), nutrition computed per gram from MoH data
  (USDA cross-check); accurate amounts (real-recipe quantities).
  - Suggest by: time of day / what's eaten today (calories left, protein
    left, fiber), variety (already fried -> grilled/baked; no same protein
    twice a day), taste profile, ratings; "Another one" button; real
    research rules (MoH guidelines, protein ~0.4 g/kg per meal, veg+fiber
    daily, limit fried, WHO sugars).
  - Kosher only: never meat + dairy; after dairy wait 30 min, after meat
    wait 6 h (real clock, from logged food). Parve alternatives (margarine
    for butter, non-dairy cream…); NO vegan meat substitutes.
  - Taste profile setup (cuisines e.g. Middle Eastern, spice level,
    dislikes/allergies, kitchen tools, servings). "Never suggest X" button
    per ingredient (e.g. tofu): never again; recipes swap it for a real,
    working substitute.
  - Easy/medium/hard + short/long time filters; clear step-by-step; Cook
    mode (big steps + timer per step) -> one tap logs it to Food.
  - Rate + learn (thumbs up/down). My own recipes (create; nutrition from
    ingredients: kcal, sugars, protein, etc.).
  - Weekly plan + shopping list; shopping list items can be marked
    out / in stock manually (finished chicken -> mark; re-mark when bought).
  - "What can I make?" (pick what's in the fridge), Craving swap (healthier
    version of the craved dish), Batch cooking = toggle + number of meals
    (covers cooking for two); amounts scale accurately.
  - Ingredients/products must be available in Israel (general items ok).
  - **Layout = "Mix A + B" (owner chose; the first busy demo was rejected as
    messy: keep it MINIMAL, few words, lots of space):** Health tab
    "Kitchen" opens to ONE meal idea (sticker, name, "35 min · 520 kcal ·
    46 g protein", buttons Cook it / Other), "Why this?" behind a small ⓘ,
    a small "I'm craving… · My fridge" link under it, and 4 small icons at
    the bottom: Recipes, Plan, Shopping, Taste. Each opens its own clean
    page/window. Same on the phone.
  - **Build phases (check off; pause every ~15 min):**
    - [x] 1 Data: foods-il.json now has saturated fat + sodium (rows: ...,
          sugars, fiber, satFat, sodiumMg); `src/shared/nutrition.ts`
          (tested): Nutri-Score 2023 (thresholds from Open Food Facts'
          reference code, raw.githubusercontent.com reachable; wikipedia /
          pubmed / santepubliquefrance are blocked here), A/B healthy, C no
          mark, D/E less healthy; Israeli red labels (solid 400 mg Na / 10 g
          sugar / 4 g sat; liquid 300 / 5 / 3; plain single foods exempt);
          liquid detection + density (cup grams / 240). `ilProduct` fills
          grade, red, liquid, density. NEXT: phase 2 UI.
    - [x] 2 Food UI (owner approved demo food2: Add = one number + one unit
          menu g/ml/cup/tbsp/piece/box, "Fix values" + "+ oil" small links;
          list = one small dot green/orange + ≈ for estimates; totals =
          kcal/protein/carbs/fat/fiber/sugar bars + red-label count + Week
          report). DONE 2a: one number + unit menu in Add food
          (`amountUnits`/`unitGrams`/`nutrientsFor`/`startGrams` in food.ts,
          tested; ml for liquids incl. Modulen; cup/spoon/slice from MoH =
          "≈"; food lines store ml/qty/unit/exact/grade/red + fiber/satFat/
          sodium; editor = one amount field in the line's own unit;
          `amountText` shows "≈" for estimates). DONE 2b: `HealthDot` on
          every line (green/orange/none; tap = Healthy / Less / Automatic,
          saved as `foodpref` {key, healthy}; `healthMark`/`gradeOfFood`/
          `foodKey` in food.ts), nutrition label shows the mark + Israeli
          red labels (עתיר סוכר/נתרן/שומן רווי). Tiny pieces (<5 g) don't
          start in pieces. DONE 2c: Totals card = kcal (≈ + "± N" from
          estimates) + Protein/Carbs/Fat(max)/Fiber/Sugars(max) bars vs
          `macroGoals` (health.ts, sourced, tested) + red-label food count
          (`foodTotals`). DONE 2d: "Fix values" link under the nutrition
          label + "Copy from the package" (typed food / nothing found) =
          `LabelEditor` -> `myproduct` health record {key (product id or
          my:<id>), name, brand, per100 incl. satFat/sodium, liquid};
          `withMine`/`searchMine`/`ilByCode` (food.ts, tested): your
          products come first ("Mine") and replace database values; "+ oil"
          link = olive oil (MoH 82104000) by its own spoons, "≈". Eating out
          S/M/L = the MoH small/medium/large portion units already in the
          unit menu ("≈"). DONE 2e: "Again" chips (`RecentChips`: ★
          favorites first, then recent foods, one tap = same amount again;
          in the Food tab and Today's Add food window), ★ in the food
          editor (`FavStar`, foodpref.fav), "Repeat…" link on the day's
          list (`RepeatMeal`: last 7 days' meals, copies all its foods)
          (`recentFoods`/`pastMeals`/`copyFood`, tested). DONE 2f: "Week
          report ›" under Totals = `WeekReportModal` (`weekReport` in
          food.ts, tested): avg kcal/protein of finished fully-logged days,
          healthy/less % of calories bar, red-label count, top 5 calorie
          sources, most eaten, closest/farthest day to goal. Phase 2 QA:
          health-redesign + phone-menus pass. NEXT: phase 3.
    - [x] 3 Shared: `library` Firestore collection (one doc per product:
          key, name, brand, barcode, liquid, per100, up/down votes,
          updatedAt; rules in firebase/firestore.rules: any signed-in user
          reads/adds, votes move by 1 only, no other fields, no deletes;
          tested on the emulator). `src/ui/foodLibrary.ts` = cached copy
          (downloads only changes, max every 10 min): "Fix values" /
          "Copy from the package" publish name + values; the healthy dot
          sends your vote (`voteDelta`, each person counts once); mark =
          yours > users' majority (>= 2 votes, `votedMark`) > automatic.
          Shared products show in search as "Bloom". Online food search
          ON by default (one-time switch `foodOnlineV2` in normalizeSnapshot).
          Barcode: back camera (facingMode environment), your own + shared
          products first (works offline), unknown barcode -> "Copy from the
          package" saved as off:<barcode>. **OWNER MUST PASTE THE NEW RULES
          before release (Firebase console -> Firestore -> Rules).**
    - [~] 4 Bigger offline DB: CODE DONE (`offILProduct`/`searchOffIL`/
          `offILByBarcode` in food.ts, tested; `loadFoodsOffIL` lazy chunk;
          products shown before MoH general foods; barcode checks own ->
          shared -> built-in -> online; scanner works with online off).
          DATA: `node scripts/fetch-foods-off-il.mjs` (resumable, caches
          pages in /tmp/bloom-off-il, 12 s apart; ~9,350 Israeli products on
          OFF, page size capped at 100) -> src/data/foods-off-il.json (ODbL,
          attribution in "source"). OFF answered 503 "temporarily
          unavailable" on 26-27 Nov; file is a placeholder until it runs.
    - [ ] 5 Recipes DB (original, ingredients = MoH ids + grams, steps,
          kosher type meat/dairy/parve, time, difficulty, cuisine, method,
          meal type, substitutions).
    - [ ] 6 Kitchen: suggestion engine (rules + scoring + kosher clock),
          taste profile, never-suggest + swaps, cook mode + log it, ratings,
          my recipes, craving swap, fridge, batch toggle + meals count, week
          plan, shopping list + pantry (out / bought).
    - [ ] 7 QA everything (PC + phone, EN/HE, light/dark), release.
- Owner rule: every feature always goes to BOTH the PC and the phone app.

## Open ideas
- (none right now)
