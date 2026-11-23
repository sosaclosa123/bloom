# Health tab: build plan (approved by the owner)

Build in a **fresh session**. Work through the checklist **in order**; after
each step: build, test, commit + push (each push is a release), then tick the
box here in the same commit. If a session runs out of usage, the next one
reads this file, checks `git log`, and continues from the first unticked box.
Follow `CLAUDE.md` (short answers, question window, demos before design
changes, high-quality testing in both languages, light/dark, sizes).

Approved demo: rail tab with a heart icon; page = "Today's check-in" card on
top (water glasses, mood, sleep, energy), tracker cards below; IBD cards are
marked "IBD" and use a soft pink tint; 30-day trend with flare days in pink.

## Privacy (most important; never break)
- New collection `health` (kept out of every other feature). Every health
  record is **always private**: no share toggle, `visibility` forced to
  `'private'` on save (like `asPrivateDay`), and the sync engine must never put
  a health record in the shared space, even if one arrives with `'shared'`.
- Sync = the owner's own private user scope only. Check
  `firebase/firestore.rules` so a user scope is readable/writable only by its
  own uid; add a unit test in `src/sync` that health records always go to the
  user scope.
- Never shown in: Search, calendar, Scheduled, startup window (unless Health
  is on, and IBD items only if IBD is on), notifications text for others.

## Settings (per device; default OFF)
- `healthEnabled` (default false). Rail tab **always visible**; when off it is
  dimmed, and clicking it shows "Health is off · Turn on in Settings" (button
  opens Settings).
- `healthIbd` (default false), only active when Health is on. When off, every
  IBD part is **completely hidden** (bathroom log, Crohn's symptoms, flare
  timeline, IBD tests, trigger-food insights, IBD questions in the profile).
- Her PC: both stay off (the default) → she never sees it.
- Anything turned off never appears in the startup "Coming up" window.

## Personal profile (questionnaire)
Detailed, one question per screen, skippable, editable later in the tab.
- Body: age, sex, height, weight, activity level (sedentary / light / active /
  very active, + minutes of exercise per day), climate/season (hot days),
  pregnancy/breastfeeding (if relevant), kidney/heart conditions that limit
  fluids (then show "follow your doctor's limit" and let them set it).
- IBD (only if IBD on): diagnosis (Crohn's / UC), location, current meds,
  ostomy or J-pouch, typical stools per day, known trigger foods.
- Results, computed by pure functions in `src/shared/health.ts` (unit-tested,
  with the source noted in a comment):
  - **Water goal**: base ≈ 35 ml per kg body weight (EFSA/NAM-based guidance;
    EFSA adequate intake ~2.0 L/day women, ~2.5 L/day men total water,
    ~70-80% from drinks), + ~500 ml per hour of exercise, + ~500 ml on hot
    days, + extra when the day's bathroom log shows diarrhoea / high output
    (IBD) or an ostomy. Clamp to a sensible range; show "why" in one line.
  - BMI (WHO categories) shown neutrally; no weight-loss pressure.
  - Crohn's activity: **Harvey-Bradshaw Index** from daily answers (general
    well-being, abdominal pain, liquid stools count, abdominal mass,
    complications) → remission < 5, mild 5-7, moderate 8-16, severe > 16.
    (UC: simple partial Mayo-style daily score.) Shown as a trend, not a
    diagnosis; flares = days in mild+ or marked "Flare".
- Always show a small note: "Not medical advice. Talk to your doctor."

## Trackers
- Daily check-in (one tap each): water (glasses or ml toward the goal), mood
  1-5, sleep hours, energy 1-5, stress 1-5.
- Medications & supplements: name, dose, times, reminders (use the existing
  reminder/scheduler system; reminder text stays generic like "Medication",
  never the drug name, if the owner prefers), taken ✓ history.
- Food log: meals + tags; insight cards later ("on days with dairy, symptoms
  were worse" via simple counts, IBD only).
- Body: weight, plus exercise minutes/steps (manual).
- Tests: lab results (date, name, value, unit), e.g. calprotectin, CRP,
  hemoglobin, iron, B12, vitamin D (IBD tests only when IBD on).
- Doctor visits: date + notes (can link to a calendar event, private).
- IBD: bathroom log (time, Bristol 1-7, urgency, blood, pain, notes), Crohn's
  symptoms (pain, fatigue, flare none/mild/flare), HBI daily score, 30-day
  trend chart with flare days in pink.
- Trends: week / month charts for water, sleep, mood, weight, symptoms.

## Checklist
- [x] 1. Data model (`health` collection, types, migration), privacy
      enforcement in save + sync, rules check, unit tests.
- [x] 2. Settings: `healthEnabled`, `healthIbd`; rail heart tab (dimmed when
      off + "Turn on in Settings"); strings EN+HE.
- [x] 3. Profile questionnaire + `src/shared/health.ts` formulas (water goal,
      BMI, HBI) with tests.
- [x] 4. Daily check-in card (water goal progress, mood, sleep, energy, stress).
- [x] 5. Medications (+ private reminders) and Body/Tests/Doctor cards.
- [ ] 6. IBD: bathroom log, symptoms, HBI, flare marking (hidden when IBD off).
- [ ] 7. Trends charts (+ 30-day flare timeline) and food insights.
- [ ] 8. Startup window rules + full QA (EN/HE, light/dark, sizes, large
      text, privacy tests, desktop). Update `CLAUDE.md` rules.

## Also requested: automatic backups
- [ ] Settings → "Backups": choose a folder (e.g. OneDrive). Bloom already
      keeps daily copies in its data folder (`electron/store.ts`); also copy
      the newest one to the chosen folder weekly (keep the last 8). Include
      `health`. Show "Last backup: …".
