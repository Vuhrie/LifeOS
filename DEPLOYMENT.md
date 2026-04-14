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

- Current version: `v0.0.5`
- Current production entry file: `public/index.html`
- Static asset stylesheet: `public/styles/main.css`
- Supporting pages: `public/schedules.html`, `public/setting.html`
- Shared navigation script: `public/scripts/navigation.js`
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
- `release/v0.1.0`
- `release/v1.0.0`

### Verification Checklist

- The homepage loads successfully.
- The navbar shows `LifeOS v0.0.5`.
- The desktop navbar centers the links `Today`, `Schedules`, and `Setting`.
- The mobile menu button opens a left-side navigation sheet with branded header content and the same navigation items.
- Each page shows only its centered page title content.
- Cloudflare Pages is configured to deploy from the `public` output directory.
- The pushed `main` branch matches the intended production version.
- A backup release branch exists before each new production update after the initial release.
