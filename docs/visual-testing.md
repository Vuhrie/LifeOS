# Visual Testing

## Browser-Based Release Check

Every release pass must include a browser-based visual check before the release is considered complete.

## Current Approach

- Use Playwright with Chromium.
- Serve the `public/` directory locally.
- Check desktop and mobile layouts against expected navigation and page content behavior.
- Save generated screenshots under `tests/visual/screenshots/`.
- Review the generated screenshots through Codex image analysis before considering the release visually complete.
- Save both temporary `current` screenshots and versioned screenshots tied to the release number.

## Current Command

```bash
npm run test:visual
```

## Expected Checks

- Desktop shows the navbar brand and centered navigation links.
- Desktop `Today` page shows Google Calendar heading and control buttons.
- Desktop `Schedules` page shows Google Calendar heading, range selector, and control buttons.
- Desktop `Planner` page shows deterministic planner sections and action buttons.
- Desktop restored-auth checks show `Google Connected` on `Today`, `Schedules`, and `Planner`.
- Desktop `Planner` shows the 3-step quick planner pills and starts on `1. Life Constraints`.
- Desktop `Planner` step 2 shows the modern habit switch controls.
- Desktop `Planner` shows `Google Connected` on the connect button when a valid auth token is restored.
- Mobile hides the desktop navigation and shows the menu button.
- Mobile menu button renders as three horizontal lines.
- The drawer opens on mobile as a branded left-side sheet.
- The drawer lists `Today`, `Schedules`, `Planner`, and `Setting`.
- Loading either page should not trigger a Google sign-in popup until `Connect Google` is clicked.
- Mobile `Planner` also shows all three planner step pills.
- Mobile `Planner` step 2 shows the modern habit switch controls without overflow.
- Versioned screenshot artifacts are generated for desktop today, desktop schedules, desktop planner, desktop planner step 2, mobile closed, mobile drawer-open, mobile planner, and mobile planner step 2 states.
- Generated screenshots are also reviewed through Codex image-based inspection.
- Release screenshots are saved with both `current` and versioned filenames.
