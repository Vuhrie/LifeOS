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

- Current version: `v1.0.27`
- Current production entry file: `public/index.html`
- Static asset stylesheets: `public/styles/theme.css`, `public/styles/main.css`, `public/styles/main-shell.css`, `public/styles/main-drawer.css`, `public/styles/main-interactions.css`, `public/styles/calendar.css`, `public/styles/planner.css`, `public/styles/planner-shell.css`, `public/styles/planner-cards.css`, `public/styles/planner-ai.css`, `public/styles/planner-responsive.css`, `public/styles/planner-interactions.css`
- Supporting pages: `public/schedules.html`, `public/planner.html`, `public/setting.html`
- Shared scripts: `public/scripts/navigation.js`, `public/scripts/auth-session.js`, `public/scripts/google-connect-button.js`, `public/scripts/calendar-client.js`, `public/scripts/calendar-ui.js`, `public/scripts/planner-time.js`, `public/scripts/planner-storage.js`, `public/scripts/planner-policy.js`, `public/scripts/planner-engine.js`, `public/scripts/planner-preview-model.js`, `public/scripts/planner-view.js`, `public/scripts/planner-dom.js`, `public/scripts/planner-logic.js`, `public/scripts/planner-controller.js`, `public/scripts/planner-commitment-ui.js`, `public/scripts/planner-validation.js`, `public/scripts/planner-sync-client.js`, `public/scripts/calendar-write-client.js`, `public/scripts/ai-bridge-schema.js`, `public/scripts/ai-bridge-prompts.js`, `public/scripts/ai-bridge-parser.js`, `public/scripts/ai-bridge-ui.js`, `public/scripts/planner-page.js`, `public/scripts/setting-page.js`
- Visual test entrypoint: `tests/playwright/visual-check.js`
- Cloud sync worker: `cloudflare/planner-sync-worker/src/index.js`

### Cloudflare Pages Setup

- Connect the GitHub repository `Vuhrie/LifeOS` to Cloudflare Pages.
- Set the production branch to `main`.
- Use the repository root as the deploy source.
- No build command is required for this static version.
- No framework preset is required for this static version.
- Output directory should be `public`.

### Cloud Sync Setup (Worker + D1)

1. Create a D1 database:
   - `wrangler d1 create lifeos_planner_db`
2. Update `cloudflare/planner-sync-worker/wrangler.toml` with the generated `database_id`.
3. Apply schema:
   - `wrangler d1 execute lifeos_planner_db --file=cloudflare/planner-sync-worker/schema.sql`
4. If your D1 database was created before `v1.0.21`, run the migration once:
   - `wrangler d1 execute lifeos_planner_db --file=cloudflare/planner-sync-worker/migrations/0001_profile_columns.sql`
5. Deploy worker:
   - `wrangler deploy --config cloudflare/planner-sync-worker/wrangler.toml`
6. Route `/api/planner/*` from your site domain to the deployed worker.
7. Confirm `public/scripts/config.js` has `window.LIFEOS_PLANNER_SYNC_CONFIG.apiBaseUrl` pointing to that API base.

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
- `release/v0.6.0`
- `release/v0.7.0`
- `release/v0.8.0`
- `release/v0.8.1`
- `release/v0.8.2`
- `release/v1.0.0`

### Verification Checklist

- The homepage loads successfully.
- The navbar shows `LifeOS v1.0.27`.
- The desktop navbar centers the links `Today`, `Schedules`, `Planner`, and `Setting`.
- Desktop navbar includes `Connect Google` on the right side.
- The mobile menu button opens a left-side navigation sheet with the same navigation items.
- Mobile drawer includes `Connect Google` as the first action item.
- `Today` shows the Google Calendar panel and today-focused empty/auth states before sign-in.
- `Schedules` shows the Google Calendar panel with selectable upcoming ranges.
- `Planner` supports a 3-step quick planning flow with deterministic draft generation and explicit commit to Google Calendar.
- `Planner` step 1 includes unified commitments, protected necessity durations, and rolling-horizon controls.
- `Planner` shows an in-page input status block and still allows generation with missing goals/habits/commitments.
- `Planner` commitment controls adapt by type (weekly/date-range/one-off) and weekday applicability.
- `Planner` draft preview uses calendar-style merged schedule view (existing + planned) before commit.
- `Planner` step 2 supports multiple goals, custom habits/sessions, and manual AI patch import.
- `Planner` requires Google sign-in before planning actions and uses account-scoped planner state.
- Signed-in planner state syncs through `/api/planner/profile` for cross-device continuity.
- `Planner` draft output includes a schedule-style board view with supporting unscheduled/conflict lists.
- `Today`, `Schedules`, and `Planner` all reflect signed-in state as `Google Connected`.
- Desktop hover states clearly indicate interactive elements without affecting non-interactive cards/text.
- Google sign-in popup opens only when the user explicitly clicks `Connect Google`.
- Cloudflare Pages is configured to deploy from the `public` output directory.
- The pushed `main` branch matches the intended production version.
- A backup release branch exists before each new production update after the initial release.
