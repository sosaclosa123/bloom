# Android app plan (checklist for any session)

Owner's choices (2026-11-23):
- Both owner and girlfriend install it (she uses Hebrew: RTL must be right).
- Everything (Calendar, Scheduled, Countdowns, Wallet, Health, Stickers,
  Settings) in a phone layout. Icons, stickers, colors = exactly the PC app.
- Bottom tab bar: Calendar, Scheduled, Countdowns, Wallet, Health; gear +
  search at the top.
- Calendar = "combo": full month with short event names (like the PC); tap a
  day -> month shrinks to small squares with color dots and the day's panel
  shows underneath (not a popup). Close with the X, tapping the same day, or
  swiping the panel down. Smooth animation.
- Update = "Update available" button (downloads the APK, Android asks
  "Install?"). Free APK from GitHub Releases, no Play Store.
- PC-only parts hidden on the phone: game mode, tray, start with Windows,
  startup window, folder backups.

## Steps
- [x] 1. Capacitor deps + `android/` project (cap add), app id `app.bloom.calendar`
- [ ] 2. Platform layer `src/platform/android.ts`: file storage (Filesystem),
      photos/docs as files, open PDF / share backup (native plugin),
      notifications (LocalNotifications, rescheduled on every change),
      update check (GitHub releases), back button
- [ ] 3. Phone layout (`.phone` class): bottom tabs, header, combo month,
      day panel with swipe, full-screen modals, all pages. QA with
      `?phone=1` in browser (EN/HE, light/dark, 360/412/480 widths)
- [~] 4. Native bits (plugin, manifest, icons done; check in CI): Java plugin (open file / install APK / share), manifest
      permissions (notifications, exact alarm, install packages), icons
- [ ] 5. CI: Android job (APK signed with keystore from GitHub secrets),
      attach `Bloom-X.Y.Z.apk` to the release
- [ ] 6. Owner: add the 2 GitHub secrets (simple steps), first install
- [ ] 7. Update CLAUDE.md + docs/HISTORY.md

## Notes / gotchas
- Local container has no Android SDK (dl.google.com blocked): the APK is
  only built in CI. Trigger CI on the work branch with workflow_dispatch.
