# Visual Testing

## Browser-Based Release Check

Every release pass must include a browser-based visual check before the release is considered complete.

## Current Approach

- Use Playwright with Chromium.
- Serve the `public/` directory locally.
- Check desktop and mobile layouts against expected navigation behavior.
- Save generated screenshots under `tests/visual/screenshots/`.

## Current Command

```bash
npm run test:visual
```

## Expected Checks

- Desktop shows the navbar brand and centered navigation links.
- Mobile hides the desktop navigation and shows the menu button.
- The drawer opens on mobile and lists `Today`, `Schedules`, and `Setting`.
- The visible page title matches the selected page.
