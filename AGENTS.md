# AGENTS.md

## Working Instructions

Follow these principles for all work in this repository:

### Code

- Keep implementations simple and easy to understand.
- Optimize where it meaningfully improves performance or maintainability.
- Prioritize readability over cleverness.
- Favor code that is easy to read, easy to test, and easy to change.
- Write modular code with clear separation of responsibilities.
- Keep code files at 300 lines or fewer on average; split files when they start growing beyond that limit.
- Add useful comments where intent or logic may not be immediately obvious.
- Maintain a code hierarchy tree file in the repository so the structure of the codebase stays easy to visualize during development.
- Prefer a simple structure that is easy to deploy and maintain.

### Versioning And Releases

- Treat every requested implementation task as a release pass by default unless explicitly stated otherwise.
- Use semantic-style version naming such as `v0.0.1`, `v0.1.0`, and `v1.0.0`.
- Before promoting a new version to production, create a backup branch from the current production state using the format `release/vX.Y.Z`.
- Treat each `release/vX.Y.Z` branch as a restore point for the version currently or previously deployed.
- Push the latest approved production-ready updates to `main` only after the backup release branch has been created.
- Keep version references in the UI and project documentation aligned with the current release.

### Deployment

- Treat `main` as the production branch.
- Keep the project compatible with Cloudflare Pages deployment.
- Prefer lightweight static-first implementation choices unless a backend feature is clearly needed.
- Make deployment steps and hosting assumptions easy to understand for future updates.

### Testing

- Visually verify frontend behavior and user-facing flows when applicable.
- Prefer automated visual regression testing for frontend UI when practical, using repeatable screenshots across key viewport sizes.
- Keep approved baseline images or equivalent visual references so future UI changes can be compared against known-good output.
- Verify important UI text, layout alignment, and obvious overflow or rendering issues as part of visual testing.
- Test backend logic and execution paths to confirm correctness.
- Treat both usability and functional reliability as part of done.
