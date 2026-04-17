# CODEBASE_TREE.md

## Code Hierarchy

```text
Life OS/
|-- AGENTS.md
|-- CODEBASE_TREE.md
|-- DEPLOYMENT.md
|-- package.json
|-- package-lock.json
|-- docs/
|   |-- google-calendar-setup.md
|   |-- release-notes.md
|   `-- visual-testing.md
|-- cloudflare/
|   `-- planner-sync-worker/
|       |-- schema.sql
|       |-- wrangler.toml
|       `-- src/
|           `-- index.js
|-- public/
|   |-- index.html
|   |-- planner.html
|   |-- schedules.html
|   |-- setting.html
|   |-- assets/
|   |   `-- images/
|   |-- scripts/
|   |   |-- ai-bridge-parser.js
|   |   |-- ai-bridge-prompts.js
|   |   |-- ai-bridge-schema.js
|   |   |-- ai-bridge-ui.js
|   |   |-- ai-bridge-validator.js
|   |   |-- auth-session.js
|   |   |-- calendar-client.js
|   |   |-- calendar-ui.js
|   |   |-- calendar-write-client.js
|   |   |-- config.js
|   |   |-- google-connect-button.js
|   |   |-- navigation.js
|   |   |-- planner-commitment-ui.js
|   |   |-- planner-controller.js
|   |   |-- planner-dom.js
|   |   |-- planner-engine.js
|   |   |-- planner-logic.js
|   |   |-- planner-page.js
|   |   |-- planner-policy.js
|   |   |-- planner-preview-model.js
|   |   |-- planner-storage.js
|   |   |-- planner-state-cleanup.js
|   |   |-- planner-sync-client.js
|   |   |-- planner-time.js
|   |   |-- planner-validation.js
|   |   |-- planner-view.js
|   |   |-- schedules-page.js
|   |   |-- setting-page.js
|   |   `-- today-page.js
|   `-- styles/
|       |-- calendar.css
|       |-- main.css
|       |-- main-drawer.css
|       |-- main-interactions.css
|       |-- main-shell.css
|       |-- planner-ai.css
|       |-- planner-cards.css
|       |-- planner-draft-calendar.css
|       |-- planner-interactions.css
|       |-- planner-responsive.css
|       |-- planner-shell.css
|       `-- theme.css
|-- tests/
|   |-- playwright/
|   |   `-- visual-check.js
|   `-- visual/
|       |-- baselines/
|       `-- screenshots/
|           |-- visual-test-*-current.png
|           `-- visual-test-*-vX.Y.Z.png
`-- tools/
```

## Notes

- Keep deployable app files in `public/`.
- Keep release and setup docs in `docs/`.
- Keep visual automation and screenshot artifacts under `tests/visual/`.
- Update this tree when files are added, renamed, or removed.
