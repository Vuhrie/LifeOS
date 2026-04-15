# Release Notes

## v0.4.2

- Unified Google connect-button state rendering across `Today`, `Schedules`, and `Planner`.
- Shared persisted Google session restore across read and write calendar flows, including legacy write-token migration.
- Updated `Today` and `Schedules` connect behavior to avoid re-prompting when already signed in.
- Added release visual assertions that all three pages show `Google Connected` after restored auth session.

## v0.4.1

- Updated planner Google auth controls so `Connect Google` visibly changes to `Google Connected` after sign-in.
- Added explicit auth button visual states for connected, loading, idle, and error.
- Redesigned planner habit controls into modern switch-style toggles with improved readability and tap targets.
- Added dedicated planner step-2 screenshot coverage for both desktop and mobile visual checks.

## v0.4.0

- Replaced the planner layout with a 3-step quick wizard: `Life Constraints`, `What I Want`, and `Draft and Commit`.
- Added deterministic quick-profile inputs for wake/sleep rhythm, fixed commitments, and habit toggles.
- Added automatic availability derivation from fixed commitments to reduce planner setup friction.
- Added a shared planner view module to keep planner logic modular and below the line-count guideline.
- Updated release visual checks to validate planner stepper behavior on both desktop and mobile.

## v0.3.0

- Added a new `Planner` page and navigation entry across desktop and mobile.
- Added a deterministic planning engine with weekly minor goals, optional tasks, manual availability rules, and repeatable scoring.
- Added draft generation with unscheduled reasoning and overlap warning preview.
- Added explicit commit flow for writing planner draft events to Google Calendar with event upsert behavior.
- Upgraded planner Google integration to write-capable scope while preserving explicit user-triggered auth.

## v0.2.0

- Updated auth bootstrap behavior so Google sign-in popup no longer opens automatically on page load.
- Kept session restore for valid saved tokens, so events can still auto-load without interactive sign-in.
- Redesigned the UI with a Frutiger Aero-inspired glass and ocean visual theme for desktop and mobile.
- Preserved existing navigation and Google Calendar flows while refreshing visual styling.

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
