# Bloom 🌸

A soft, simple calendar for Windows, built so the same code can become a phone app with live sync later.

## Features

- **Month and week views** in light pastel colors, with light and dark mode.
- **Day colors.** Click the dot in a day's corner to cycle green (free) → yellow (some plans) → red (packed).
- **Click any date** to get an **Add to this day** row: ✅ To-do list · 📝 Note · 📖 Journal · 📅 Event · 🔔 Reminder.
- **Everything shows on the calendar.** Each date displays small chips: 📖 Journal, ☑ 2/5 to-dos done (turns green when all are done), 📝 notes and 🔔 reminders. Clicking the 📖 chip opens that day's journal.
- **Journal pop-up.** A blue notebook window over a dimmed, blurred background, with lined paper, photos and a **Private / Shared** switch per entry (private by default). The arrows step to the previous or next day. It opens from the calendar chip, the day panel or the **Journal** page (press `J`), which lists all entries like a diary.
- **Events** with times, all-day and multi-day spans, colors, location, notes, repeats and a private flag.
- **Reminders** fire at the exact minute:
  - repeat daily, weekly, monthly or yearly
  - snooze for 10 minutes or 1 hour
  - remind X minutes, hours or days before an event
  - use built-in sounds or your own mp3, wav or ogg files
- **Game Mode.** Reminder popups never take focus, so they can't kick you out of a full-screen game. While a full-screen game is running, Bloom only plays a soft sound and shows a *"While you were playing"* card when you're done. You can also switch it to *Always quiet* or *Off* from the tray.
- **Quick add.** Type `dinner fri 20:00 remind 1h` or `ארוחת ערב מחר 20:00 תזכורת שעה` and press Enter.
- **Countdowns** to anniversaries, trips and birthdays (these can repeat every year).
- **Holidays:** Jewish (Israel or diaspora schedule), Christian, both or none, plus an optional Hebrew date.
- **English and Hebrew**, with a full right-to-left layout.
- **Search** with Ctrl+K.
- **Backup and restore.** Restoring merges records, so nothing is lost. Bloom also keeps 14 daily automatic backups.
- **Starts with Windows** and lives in the system tray.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+K` | Search |
| `N` | New event |
| `Q` or `/` | Quick add |
| `T` | Jump to today |
| `M` / `W` / `J` | Month / week / journal view |
| `←` / `→` | Previous / next month or week |
| `Esc` | Close panel or dialog |

## Install

1. Download **`Bloom-Setup-x.y.z.exe`** from the repo's **Releases** page, or from **Actions → Build Bloom → latest run → Artifacts**.
2. Double-click it. It installs in one click, needs no admin rights, adds a desktop and Start-menu shortcut, and opens Bloom when it's done.
3. Windows may show "Windows protected your PC" because the app isn't code-signed. Click **More info → Run anyway**.

### Moving to a new PC

1. On the old PC: **Settings → Backup → Save backup…**. This makes one `.json` file containing everything: events, notes, journal, photos and sounds.
2. On the new PC: run the installer, then **Settings → Backup → Restore backup…** and pick that file.

Restoring merges records, so it's safe to run more than once. Bloom also keeps 14 daily automatic backups in `%APPDATA%\Bloom\backups\`. Data lives in `%APPDATA%\Bloom\`, with photos in `photos\` and custom sounds in `sounds\`.

To publish a new version: bump `version` in `package.json` and push to `main`. GitHub builds the installer and publishes it as a release. Each push to `main` refreshes the installer for the current version.

## Development

```bash
npm install
npm run dev        # Electron app with hot reload
npm run dev:web    # browser only (uses localStorage)
npm test           # unit tests
npm run dist:win   # build the Windows installer (on Windows)
```

## How it's built

```
src/shared/     Pure logic shared by every platform: data model, recurrence,
                reminder timing, quick-add parser, holidays, merge/sync rules.
src/platform/   PlatformAPI: the only thing the UI talks to.
                Desktop = Electron bridge, web = localStorage.
                A phone app implements this same interface.
src/ui/         React components.
src/theme/      tokens.css (every color, size and radius) + app.css.
src/i18n/       English and Hebrew text.
electron/       Windows shell: window, tray, JSON file store, scheduler,
                game detection, the focus-free popup window.
```

### Ready for new designs

All visual decisions live in `src/theme/tokens.css`: colors (including the `--journal-*` blue notebook and the `--chip-*` calendar chips), spacing, radii, shadows, fonts and timing. Every animation is in `src/theme/motion.css` and turns off automatically when Windows animations are disabled. Components use only those tokens and logical CSS properties, so a new design means editing tokens and component styles, not app logic.

### Ready for the phone app and live sync

- Every record has a UUID, `updatedAt`, a soft-delete `deletedAt`, `ownerId` and `visibility` (shared or private), which is what a sync server needs.
- `merge()` in `src/shared/db.ts` already does record-by-record last-write-wins merging. Backup restore uses it today.
- Reminder timing (`src/shared/alerts.ts`) and recurrence are platform-independent, so a phone app can schedule native notifications from the same code.
- Next steps: add a sync backend (for example Supabase or Firebase) with user accounts for the couple calendar, then wrap the same UI with Capacitor for Android and iOS.
