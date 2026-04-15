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
|   |   |-- calendar-write-client.js
|   |   |-- calendar-client.js
|   |   |-- calendar-ui.js
|   |   |-- config.js
|   |   |-- google-connect-button.js
|   |   |-- planner-engine.js
|   |   |-- planner-page.js
|   |   |-- planner-storage.js
|   |   |-- planner-view.js
|   |   |-- schedules-page.js
|   |   |-- today-page.js
|   |   `-- navigation.js
|   |-- styles/
|   |   |-- calendar.css
|   |   |-- main.css
|   |   |-- planner-interactions.css
|   |   |-- planner.css
|   |   `-- theme.css
|   |-- index.html
|   |-- planner.html
|   |-- schedules.html
|   `-- setting.html
|-- tests/
|   |-- playwright/
|   |   `-- visual-check.js
|   `-- visual/
|       |-- baselines/
|       `-- screenshots/
|           |-- visual-test-desktop-v0.0.2.png
|           |-- visual-test-desktop-schedules-v0.3.0.png
|           |-- visual-test-desktop-planner-v0.3.0.png
|           |-- visual-test-desktop-schedules-v0.4.0.png
|           |-- visual-test-desktop-planner-v0.4.0.png
|           |-- visual-test-desktop-v0.4.1.png
|           |-- visual-test-desktop-schedules-v0.4.1.png
|           |-- visual-test-desktop-planner-v0.4.1.png
|           |-- visual-test-desktop-planner-step2-v0.4.1.png
|           |-- visual-test-desktop-v0.4.2.png
|           |-- visual-test-desktop-schedules-v0.4.2.png
|           |-- visual-test-desktop-planner-v0.4.2.png
|           |-- visual-test-desktop-planner-step2-v0.4.2.png
|           |-- visual-test-desktop-v0.4.3.png
|           |-- visual-test-desktop-schedules-v0.4.3.png
|           |-- visual-test-desktop-planner-v0.4.3.png
|           |-- visual-test-desktop-planner-step2-v0.4.3.png
|           |-- visual-test-desktop-hover-v0.4.3.png
|           |-- visual-test-mobile-open-v0.3.0.png
|           |-- visual-test-mobile-planner-v0.3.0.png
|           |-- visual-test-mobile-open-v0.4.0.png
|           |-- visual-test-mobile-planner-v0.4.0.png
|           |-- visual-test-mobile-v0.3.0.png
|           |-- visual-test-mobile-v0.4.0.png
|           |-- visual-test-mobile-v0.4.1.png
|           |-- visual-test-mobile-open-v0.4.1.png
|           |-- visual-test-mobile-planner-v0.4.1.png
|           |-- visual-test-mobile-planner-step2-v0.4.1.png
|           |-- visual-test-mobile-v0.4.2.png
|           |-- visual-test-mobile-open-v0.4.2.png
|           |-- visual-test-mobile-planner-v0.4.2.png
|           |-- visual-test-mobile-planner-step2-v0.4.2.png
|           |-- visual-test-mobile-v0.4.3.png
|           |-- visual-test-mobile-open-v0.4.3.png
|           |-- visual-test-mobile-planner-v0.4.3.png
|           `-- visual-test-mobile-planner-step2-v0.4.3.png
`-- tools/
```

## Notes

- Keep the root focused on release, deployment, and package-level files.
- Keep deployable site files under `public/`.
- Keep automated checks and screenshot artifacts under `tests/`.
- Update this file alongside meaningful structural changes.
