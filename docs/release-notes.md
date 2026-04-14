# Release Notes

## v0.1.1

- Added auth session persistence so Google Calendar access can be reused across page reloads for about one hour.
- Added automatic auth bootstrap and silent sign-in attempt on page load for both `Today` and `Schedules`.
- Added configurable auth session settings in `public/scripts/config.js` (`authPersistence`, `authDurationSeconds`, `refreshSkewSeconds`).
- Kept sign-out as a full session clear by removing stored token state from browser storage.

## v0.1.0

- Added Google Calendar integration scaffolding using Google Identity Services and Calendar API readonly access.
- Updated the `Today` page to show today-only events from Google Calendar after sign-in.
- Updated the `Schedules` page to show grouped upcoming events with selectable 7/14/30-day ranges.
- Added connect, refresh, and sign-out controls with clear loading/error/empty states.
- Expanded visual testing to capture desktop `Today`, desktop `Schedules`, mobile closed state, and mobile drawer-open state with versioned artifacts.

## v0.0.7

- Fixed the mobile menu trigger layout so the three bars stack vertically instead of rendering in a row.
- Preserved the cleaner equal-width `=`-style appearance while making the hamburger icon read correctly at a glance.

## v0.0.6

- Refined the mobile menu trigger into a cleaner three-line `=`-style icon.
- Tightened the hamburger spacing and made the bars more uniform for a more balanced appearance.

## v0.0.5

- Fixed the mobile drawer layering so the sheet properly sits above the navbar and background content.
- Increased the scrim strength and softened the background while the mobile sheet is open.
- Tightened drawer spacing so navigation content sits more comfortably inside the sheet.
- Updated visual testing to save both temporary `current` screenshots and versioned release screenshots.

## v0.0.4

- Improved the mobile navigation drawer into a branded left-side navigation sheet.
- Increased mobile tap target sizes and strengthened the active navigation state.
- Added drawer metadata and supporting copy for each mobile destination.
- Improved drawer behavior with focus return, focus trapping, and close-on-link selection.

## v0.0.3

- Reorganized the repository into clearer app, docs, and test directories.
- Moved deployable site files under `public/`.
- Moved shared CSS to `public/styles/main.css`.
- Moved shared navigation script to `public/scripts/navigation.js`.
- Added a dedicated Playwright visual test entrypoint under `tests/playwright/`.
- Moved generated visual screenshots under `tests/visual/screenshots/`.

## v0.0.2

- Added the shared navbar layout.
- Added desktop navigation links for `Today`, `Schedules`, and `Setting`.
- Added a mobile drawer menu.
- Split the interface into three static pages.

## v0.0.1

- Published the initial landing page release.
