# Release Notes

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
