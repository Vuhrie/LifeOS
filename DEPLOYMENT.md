# DEPLOYMENT.md

## Cloudflare Pages Deployment Plan

This project is set up as a simple static site so it can be deployed directly with Cloudflare Pages.

### Production Flow

1. Complete and verify local changes.
2. If `main` already has a deployed version, create a backup branch from the current production state using the format `release/vX.Y.Z`.
3. Update the visible version number in the UI and any matching documentation.
4. Push the approved production-ready changes to `main`.
5. Let Cloudflare Pages deploy `main` as the production site.

### Current Release Notes

- Current version: `v0.5.0`
- Current production entry file: `public/index.html`
- Static asset stylesheets: `public/styles/theme.css`, `public/styles/main.css`, `public/styles/calendar.css`, `public/styles/planner.css`, `public/styles/planner-interactions.css`
- Supporting pages: `public/schedules.html`, `public/planner.html`, `public/setting.html`
- Shared scripts: `public/scripts/navigation.js`, `public/scripts/auth-session.js`, `public/scripts/google-connect-button.js`, `public/scripts/calendar-client.js`, `public/scripts/calendar-ui.js`, `public/scripts/planner-storage.js`, `public/scripts/planner-engine.js`, `public/scripts/planner-view.js`, `public/scripts/calendar-write-client.js`, `public/scripts/ai-bridge-schema.js`, `public/scripts/ai-bridge-prompts.js`, `public/scripts/ai-bridge-parser.js`, `public/scripts/ai-bridge-ui.js`, `public/scripts/planner-page.js`
- Visual test entrypoint: `tests/playwright/visual-check.js`

### Cloudflare Pages Setup

- Connect the GitHub repository `Vuhrie/LifeOS` to Cloudflare Pages.
- Set the production branch to `main`.
- Use the repository root as the deploy source.
- No build command is required for this static version.
- No framework preset is required for this static version.
- Output directory should be `public`.

### Release Branch Examples

- `release/v0.0.1`
- `release/v0.0.2`
- `release/v0.0.3`
- `release/v0.0.4`
- `release/v0.0.5`
- `release/v0.0.6`
- `release/v0.0.7`
- `release/v0.1.0`
- `release/v0.1.1`
- `release/v0.2.0`
- `release/v0.3.0`
- `release/v0.4.0`
- `release/v0.4.1`
- `release/v0.4.2`
- `release/v0.4.3`
- `release/v0.4.4`
- `release/v0.5.0`
- `release/v1.0.0`

### Verification Checklist

- The homepage loads successfully.
- The navbar shows `LifeOS v0.5.0`.
- The desktop navbar centers the links `Today`, `Schedules`, `Planner`, and `Setting`.
- The mobile menu button opens a left-side navigation sheet with the same navigation items.
- `Today` shows the Google Calendar panel and today-focused empty/auth states before sign-in.
- `Schedules` shows the Google Calendar panel with selectable upcoming ranges.
- `Planner` supports a 3-step quick planning flow with deterministic draft generation and explicit commit to Google Calendar.
- `Planner` Step 2 includes manual AI-assist prompt/export/import workflow with JSON validation before apply.
- `Today`, `Schedules`, and `Planner` all reflect signed-in state as `Google Connected`.
- Desktop hover states clearly indicate interactive elements without affecting non-interactive cards/text.
- Google sign-in popup opens only when the user explicitly clicks `Connect Google`.
- Cloudflare Pages is configured to deploy from the `public` output directory.
- The pushed `main` branch matches the intended production version.
- A backup release branch exists before each new production update after the initial release.
