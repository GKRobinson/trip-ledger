# Trip Ledger — project brief for Claude Code

## What this is

An offline, private trip budget tracker for Android, Windows and Linux. A trip
has a start date, an end date, a budget and a way of recording spending; the
headline is **left to spend per day** = remaining ÷ days left.

It is deliberately small. Don't grow it into an itemised expense tracker
(categories, reports, receipts photos) without asking the owner.

## Owner priorities (read before changing anything)

- **Reliability and explainability over cleverness.** Boring, well-understood
  code and dependencies.
- **If a change has negative reliability consequences, stop and ask.** Present
  the trade-off; don't decide silently.
- **Offline and private.** No server, no sync, no analytics, nothing loaded
  from the network. Every build ships a strict Content-Security-Policy that
  only allows the app's own files; Android cloud backup is off.
- **Android only** for mobile — no iOS.
- The owner is a full-stack TypeScript developer.

## How it works

| Concept | Behaviour |
|---|---|
| Trip | Permanent random `id`, name, currency label (display only, no conversion), start/end date (length counts both), starting budget, pools, entries, budget changes. |
| Recording method | Chosen per trip, locked once it has entries: **running total** (total spent so far), **money left** (what's left), **daily spend** (spent that day). `spendSeries` in `src/domain/stats.ts` is the one place they're interpreted — each reduces to "total spent by this date". |
| Pools | Where money sits (cash, a card). Added together into one budget; each day's form has a section per pool. Not separate budgets. |
| Amounts | A pool's figure for a day can be several amounts (receipts, accounts) added up, each with an optional note. Stored exactly as typed. |
| Budget changes | Dated additions/removals. The budget *on a date* counts only changes up to that date — that keeps money-left trips right after a top-up. Editing the starting budget in settings is for fixing mistakes. |
| Sharing | Export writes one trip to a `.tripledger.json` file (share sheet on Android, Save dialog on desktop). Import (file picker) of an unknown trip id adds it; a known id **replaces** your copy after a preview. There is no merge — deliberately. |
| Editing rights | Usually one person tracks and others view. Each install has an id; a trip records its editor's install id. Others see it read-only with **Start editing** to take over; the editor id travels in exported files. |
| Versions | Frozen copies of a trip kept locally (never exported). Saved on every export and import, and automatically *before* deleting a day or budget change, editing a saved day, changing settings, importing, or switching. Switching never loses anything. |
| Your name | Optional per-install setting, stamped on edits and exports ("Imported from Sam"). |

## Layout

```
src/domain/     Pure logic, no I/O — everything here is unit-tested
  types.ts        Data model
  dates.ts        "YYYY-MM-DD" calendar dates (never timestamps)
  money.ts        Integer cents; parsing what people type
  stats.ts        Methods → spend series → headline figures
  trip-ops.ts     Edits (each returns a new Trip) and validation
  versions.ts     Version history and switching
  file-format.ts  Strict reader/writer for trip files, stored records, settings
  import.ts       Import preview and apply
  samples.ts      Dummy trips (Settings → "Add sample trips", and tests)
src/storage/    Repository over a 4-method TextStore (list/read/write/remove)
src/platform/   desktop.ts (Electron bridge), android.ts (Capacitor), browser.ts (dev only)
src/ui/         React screens
electron/       main.cjs (window, atomic file I/O, Save dialog) + preload.cjs
android/        Capacitor project (committed)
test/           Vitest (*.test.ts)
scripts/        make-icons.cjs (draws icons with Electron; no image library)
```

## Invariants — never regress these

1. **Saving settings keeps every entry.** An early version rebuilt the trip
   with `entries: []` and destroyed the owner's data. `updateSettings` spreads
   the existing trip; there's a test for it.
2. **Before anything destructive, save a version** (via `applyEdit` with a
   `before` kind). Imports always save the current copy first.
3. **Every file read goes through `file-format.ts`.** Damaged files are refused
   with a reason, never half-loaded; unreadable stored trips are reported and
   left untouched on disk.
4. **Schema changes:** bump `SCHEMA_VERSION` and teach `readTrip` to upgrade the
   older shape, so older trip files stay importable. Files from a newer schema
   are refused with "update the app".
5. **Writes are atomic** on every platform: write `<key>.json.tmp`, then rename.
   A `.tmp` with no `.json` beside it is recovered on read.
6. **Money is integer cents; dates are `YYYY-MM-DD` strings.** No floats in
   stored amounts, no timestamps for calendar days (time zones shift them).
7. **All state changes in `App.tsx` go through `serial`/`update`**, which read
   the latest saved record — so two quick taps can't drop an edit.

## Commands

```bash
npm install
npm run dev          # browser preview at http://localhost:5180 (localStorage, dev only)
npm test             # vitest
npm run typecheck
npm run desktop      # build + run the Electron app
npm run dist:win     # release/Trip-Ledger-<version>-Setup.exe
npm run android:sync # build + copy into android/, then: cd android && ./gradlew assembleDebug
npm run icons        # redraw icons, then: npx @capacitor/assets generate --android
```

Linux builds only on Linux — use the GitHub Actions workflow.

## Releases

1. Bump `version` in `package.json` — the single source of truth. Android's
   `versionCode` is derived from it (1.2.3 → 10203) and must go up for an APK to
   install as an update.
2. GitHub → Actions → run **Build Android APK**, **Build Windows installer**,
   **Build Linux AppImage** (manual `workflow_dispatch` only). Download from the
   run page.

Windows builds are unsigned: SmartScreen warns on first run ("More info" →
"Run anyway"). Accepted for personal use.

### Android signing

Release APKs must all be signed with the **same key**, or they won't install
over the existing app (uninstalling deletes the app's data). The release build
**fails** without a key rather than producing an unsigned APK.

- CI reads GitHub secrets: `TRIP_LEDGER_KEYSTORE_BASE64`,
  `TRIP_LEDGER_KEYSTORE_PASSWORD`, `TRIP_LEDGER_KEY_ALIAS`, `TRIP_LEDGER_KEY_PASSWORD`.
- Locally: `android/keystore.properties` (`storeFile`, `storePassword`,
  `keyAlias`, `keyPassword`; `storeFile` relative to `android/`).
- Both are gitignored. **The keystore must be backed up off this PC.**
- For testing, `./gradlew assembleDebug` needs no key — but debug APKs can't
  update a release install, or vice versa.

## Platform notes and gotchas

- **Data locations.** Windows `%APPDATA%\Trip Ledger\data`, Linux
  `~/.config/Trip Ledger/data` (both kept on uninstall); Android app-private
  storage (deleted on uninstall — exported files are the backup).
- **Linux on NVIDIA/Wayland** (owner's Bazzite PC) is the least-tested target.
  If the window is blank or flickers, run the AppImage with `--disable-gpu`.
- **Electron 45 downloads its binary on first run**, not at `npm install`.
- **TypeScript 7** (native compiler) and **Vite 8**, matching the owner's GK
  Lists project. No `@vitejs/plugin-react`, so editing a file reloads the page.
- **Chrome's `window.scrollTo` returns a Promise** — never return it from a
  `useEffect` arrow (React treats it as a broken cleanup and unmounts).
- **Capacitor's Android `rename`** may not replace an existing file; the store
  falls back to delete-then-rename (covered by the `.tmp` recovery).
- Renderer dependencies are all `devDependencies` (Vite bundles them), so
  electron-builder ships no `node_modules`. Capacitor still finds plugins there.
