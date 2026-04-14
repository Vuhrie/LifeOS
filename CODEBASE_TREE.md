# CODEBASE_TREE.md

## Code Hierarchy

Use this file to visualize the codebase structure as it grows. Update it when new folders or code files are added, moved, or removed.

```text
Life OS/
|-- AGENTS.md
|-- CODEBASE_TREE.md
|-- DEPLOYMENT.md
|-- .gitignore
|-- package-lock.json
|-- package.json
|-- docs/
|   |-- google-calendar-setup.md
|   |-- release-notes.md
|   `-- visual-testing.md
|-- public/
|   |-- assets/
|   |   `-- images/
|   |-- scripts/
|   |   |-- auth-session.js
|   |   |-- calendar-client.js
|   |   |-- calendar-ui.js
|   |   |-- config.js
|   |   |-- schedules-page.js
|   |   |-- today-page.js
|   |   `-- navigation.js
|   |-- styles/
|   |   |-- calendar.css
|   |   |-- main.css
|   |   `-- theme.css
|   |-- index.html
|   |-- schedules.html
|   `-- setting.html
|-- tests/
|   |-- playwright/
|   |   `-- visual-check.js
|   `-- visual/
|       |-- baselines/
|       `-- screenshots/
|           |-- visual-test-desktop-v0.0.2.png
|           |-- visual-test-desktop-schedules-v0.2.0.png
|           |-- visual-test-mobile-open-v0.2.0.png
|           `-- visual-test-mobile-v0.2.0.png
`-- tools/
```

## Notes

- Keep the root focused on release, deployment, and package-level files.
- Keep deployable site files under `public/`.
- Keep automated checks and screenshot artifacts under `tests/`.
- Update this file alongside meaningful structural changes.
