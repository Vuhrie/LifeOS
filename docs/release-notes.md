# Release Notes

## v1.0.28

- Fixed AI schedule apply linkage so tasks keep correct connections to newly-created minor goals even when imported JSON includes custom `minorGoalId` values.
- Added stable minor-goal source-id/title remapping during apply, preventing AI tasks from becoming orphaned and disappearing after cleanup/sync.
- Preserved downstream deterministic draft generation visibility for AI-managed minor goals and tasks by ensuring linked task relationships remain valid.

## v1.0.27

- Enforced planner-defined-only deterministic draft generation: Google calendar events are no longer fetched or used during `Generate Schedule`.
- Excluded `google_imported` commitments from deterministic draft planning and preview rendering.
- Removed imported-event overlap contribution from deterministic draft warnings so generated drafts reflect only planner-owned inputs.
- Preserved explicit Google write flow and step-3 commit controls; this change only affects draft generation inputs.

## v1.0.26

- Fixed legacy habit resurrection by sanitizing planner state to remove old `tasks` entries that carried `habitId` from pre-D1 behavior.
- Hardened deterministic `Generate` flow to ignore habit-linked persisted tasks and derive habit scheduling only from current `week.habits`.
- Updated habit deletion flow to cascade-clean linked legacy habit tasks and habit managed slots.
- Updated cloud sync state sanitation so pulled/saved profiles also strip legacy habit artifacts, preventing reappearance across devices.
- Bumped planner schema baseline to `13` for normalized storage/sync state.

## v1.0.25

- Fixed deterministic `Generate` drift that could preserve stale AI-applied habit slots with outdated durations.
- Removed the hardcoded 2-hour minor-goal default in the deterministic generation path.
- Updated generate flow to synthesize habit scheduling tasks directly from current habit definitions (frequency, duration, preferred window), so draft output reflects latest planner settings.
- Updated slot-preservation checks to keep existing slots only when they still match current planning units and durations.
- Updated release visual checks to validate the new deterministic habit-placement behavior.

## v1.0.24

- Added D1-persisted `googleDecisionContext` snapshot fields to planner state so schedule decisions can be traced against captured Google occupancy context.
- Added `Decision Context Snapshot` card in Planner Step 2 to show last captured window/event counts and last calendar commit status.
- Updated schedule prompt-build pipeline to capture and persist Google occupancy summary (`total`, `external`, `managed`, `dismissed`) each time prompt context is built.
- Upgraded calendar commit logging in planner state to explicit lifecycle statuses (`running`, `succeeded`, `partial`, `failed`) with timestamps and operation outcomes.
- Preserved draft as temporary session-only preview while canonical planner entities continue syncing through D1.

## v1.0.23

- Refactored planner draft to session-only runtime state so draft schedule preview is never persisted as canonical planner data.
- Removed persisted `week.draft` from planner state normalization and raised planner schema baseline to `12`.
- Hardened save and cloud sync serialization to strip any legacy persisted `draft` data before local save and D1 sync writes.
- Updated cleanup behavior so stale AI cleanup only mutates canonical planner entities (minor goals/tasks/managed slots), not draft persistence.
- Added explicit Step 3 UI copy clarifying that draft is temporary while defined elements and planner inputs are real saved data.

## v1.0.22

- Expanded Google auth scope to include identity claims (`openid`, `email`, `profile`) alongside calendar write scope so cloud sync verification can validate account identity reliably.
- Added forced interactive token refresh path for explicit cloud sync checks (`Sync Now`) when server auth returns `401`.
- Improved cloud sync error handling in Settings with specific guidance for identity-scope/session failures.
- Upgraded Worker `401` responses to include structured auth diagnostics (`code`, `hint`, `providerStatus`) for safer troubleshooting.
- Updated UI and automated visual release references to `v1.0.22`.

## v1.0.21

- Hardened Cloudflare Worker + D1 sync path with stricter planner-state validation, payload-size guards, and configurable CORS allowlist (`ALLOWED_ORIGINS`).
- Added richer cloud profile metadata responses (`createdAt`, `lastSeenAt`, `schemaVersion`, `serverSchemaVersion`) and worker health schema version.
- Added D1 sync-event logging table (`planner_sync_events`) for profile create/update traceability.
- Added migration script for previously deployed D1 profiles to include new sync metadata columns.
- Improved browser sync client conflict handling: remote refresh now saves a local conflict backup under `lifeos_sync_conflict_backup_v1_<accountKey>`.
- Replaced fragile sync status text encoding with stable ASCII status messages.
- Added a new Settings `Cloud Sync (D1)` card with live cloud-state check (`Sync Now`), version, and updated-at visibility per signed-in Google account.
- Updated release visual coverage to assert the new cloud sync controls in Settings.

## v1.0.20

- Added optional `scheduleBuilderInstruction` support on AI-assisted major goals and carried it into schedule prompt context.
- Updated Planner draft lifecycle to be temporary-only: drafts are no longer persisted and are cleared on leave/discard workflows.
- Removed draft "save" leave-path; users now choose `COMMIT`, `DISCARD`, or `CANCEL` when navigating away with a temporary draft.
- Stopped AI schedule import from auto-populating Step 3 draft preview; users now explicitly generate temporary drafts.
- Redesigned Settings page with a dedicated shell/cards layout and clearer Google session behavior copy.
- Updated release version labels and visual regression baseline version to `v1.0.20`.

## v1.0.19

- Updated Google auth buttons to show the signed-in account email when available instead of a generic `Google Connected` label.
- Added a functional Google account section in Settings with live account email/state and a working `Sign out` button.
- Extended read-only calendar auth state to resolve account email and expose it to shared nav button UI.
- Improved token renewal behavior to attempt silent GIS re-auth before prompting for consent, keeping sessions alive as long as Google allows.
- Updated visual regression tests for email-based connected state and Settings sign-out flow.

## v1.0.18

- Removed the `Save AI-Assisted Draft` button from Major Goals AI Assisted controls.
- Simplified major-goal AI flow to `enter goal idea -> Build Major Goal Prompt`, while preserving auto-seed behavior behind the scenes.
- Updated UI status/error copy so users are no longer instructed to save an AI-assisted draft manually.
- Added visual regression coverage to fail if the removed button reappears.

## v1.0.17

- Added automatic cleanup for stale AI-managed minor goals and tasks when their parent Major Goal has been removed.
- Hardened Major Goal deletion so tasks linked by direct `majorGoalId` or removed `minorGoalId` are pruned immediately.
- Cleared stale draft previews when orphan AI planning data is cleaned, preventing old tasks from lingering in generated schedule previews.
- Added visual regression coverage for stale AI task cleanup on Planner load.

## v1.0.16

- Upgraded Schedule Prompt Builder to a conversational flow with `status: "in_progress"` and `status: "schedule_ready"` states.
- Added in-progress import validation path for schedule AI responses: valid draft JSON can be validated but cannot be applied until `schedule_ready`.
- Added AI-managed `rest` and `free_time` rolling-plan item support in parsing, rendering, and draft persistence.
- Expanded schedule prompt policy to protect humane pacing: lunch guidance, rest/free-time guidance, transition-buffer awareness, and open-time protection.
- Added schedule validator warnings for missing lunch in free midday windows, high-load days without rest/free-time blocks, and zero-transition back-to-back blocks.
- Preserved backward compatibility for legacy one-shot schedule JSON imports (`version: "3.0"` without status).

## v1.0.15

- Removed `weeklyHours` as a required major-goal field in manual and AI-assisted flows.
- Updated major-goal semantics to use `importance` (1-5), with compatibility fallback from legacy `priority`.
- Updated major-goal AI schema/prompt/parser to require `importance` and ignore legacy `weeklyHours` with warnings.
- Updated planner draft validation so major goals no longer require weekly-hours input.
- Updated rolling schedule prompt instructions so workload is inferred from minor goals, tasks, deadlines, progress, and capacity.

## v1.0.14

- Updated AI-assisted major-goal prompt flow to support conversational clarification rounds with a `Working Major Goal Draft`.
- Added `in_progress` draft-state contract for major-goal JSON so chatbot replies can evolve across turns before finalization.
- Kept insertion gated to final `proposals_ready` responses only; `in_progress` drafts validate but cannot be inserted.
- Updated major-goal parser and UI validation messaging to guide users to continue Q&A until final proposal JSON is ready.
- Added visual regression checks for prompt requirements (`Questions For You`, `Working Major Goal Draft`, and `status":"in_progress"`).

## v1.0.13

- Fixed `Build Major Goal Prompt` so it no longer appears stuck after click and always exits pressed/loading state cleanly.
- Added fallback behavior for major-goal prompt build: when no saved AI-assisted seed exists, the current AI-assisted input fields are auto-saved and used to build the prompt.
- Added regression coverage so `Build Major Goal Prompt` works even when the user skips `Save AI-Assisted Draft`.
- Kept neutral Major Goals mode behavior: no mode preselected on load, with both manual and AI-assisted input panels hidden until explicitly selected.

## v1.0.12

- Reworked major-goal creation into two modes inside the same card: `Manual` and `AI Assisted`.
- Added dedicated AI-assisted major-goal draft flow with separate prompt builder, parser, and apply path (`major-goals-v1`) that is isolated from rolling-plan AI patch flow.
- Added new persisted planner state for AI-assisted major-goal drafts and major-goal AI builder session data.
- Updated rolling-plan AI prompt/schema/parser to remove mixed major-goal proposal contract, restoring rolling AI scope to minor goals, tasks, and rolling schedule only.
- Updated planner visual and interaction checks for new major-goal mode controls and major-goal-only prompt content expectations.

## v1.0.11

- Added AI major-goal proposal flow: AI can now suggest major-goal additions/modifications via `majorGoalProposals` without directly mutating defined major goals.
- Added explicit Planner UI approval queue for major-goal proposals, with field-level change summaries and Approve/Reject actions.
- Added schedule-generation guard: users must resolve pending major-goal proposals before `Generate Schedule` runs.
- Added planner draft leave protection for navigation/reload flows with explicit `SAVE`, `REMOVE`, or `COMMIT` decision handling before leaving.
- Kept rolling-plan application stable: approved AI rolling plans still update minor goals, tasks, and draft schedule as before.

## v1.0.10

- Hardened LifeOS-managed event detection across old and new event formats (extended properties, marker descriptions, and legacy title prefix fallback).
- Added LifeOS management markers to newly committed events (`lifeos_managed`, commit/source/type markers) to prevent re-import as immutable commitments.
- Added commit-log event-id fallback filtering so previously written LifeOS events are excluded from commitment import and AI prompt commitment context.
- Strengthened AI prompt instructions that existing calendar events are informational context only and must not override defined commitment/habit policy.

## v1.0.9

- Stopped re-importing LifeOS-managed Google Calendar events as planner commitments, preventing old managed gym blocks from being treated as locked commitments.
- Filtered LifeOS-managed calendar events out of AI prompt context so old schedule artifacts no longer override current habit definitions.
- Strengthened AI prompt rules: habit duration is fixed by habit definition and must not be shortened/extended.
- Enforced exact habit duration matching in rolling-plan validation (`start/end` duration must equal habit `durationMinutes`).

## v1.0.8

- Moved `Commit To Calendar` to Step 3 (`Rolling 7-Day Plan`) so commit can only run from the final planning stage.
- Added double confirmation for calendar replacement with explicit typed confirmation (`REPLACE`) before write starts.
- Added a live commit progress panel showing phase, percentage, current action, and deleted/added/failed counters.
- Reworked calendar commit behavior to replace the full next 7-day window: fetch existing events, delete them, then insert the rolling plan.
- Fixed missing commitment writes by building commit payload from draft preview schedule items (`planned` + `commitment`) instead of only deterministic draft slots.

## v1.0.7

- Split shower necessities into separate `Morning Shower` and `Night Shower` definitions with independent durations in Planner.
- Updated deterministic necessity blocking so both shower windows are protected daily (`Morning Shower` after wake/breakfast and `Night Shower` near sleep).
- Added backward-compatible migration from legacy single `shower` settings so existing users automatically get both shower durations preserved.
- Extended visual checks to assert the new shower inputs and prompt context for both shower definitions.

## v1.0.6

- Added daily-rhythm blocks to generated draft schedule previews so each rolling day visibly shows the wake/sleep window.
- Expanded AI prompt context with explicit necessity duration payloads and per-day daily-rhythm context to improve AI placement decisions.
- Preserved `persistedFromAiApply` flags when regenerating managed slots, preventing AI-applied non-commitment items from being dropped on later regenerations.
- Expanded visual regression checks to assert daily-rhythm rendering and necessity-duration prompt coverage.

## v1.0.5

- Fixed regenerate persistence for applied AI JSON items so non-habit entries (for example necessities and tasks) stay in the regenerated draft.
- Updated managed-slot retention logic to keep user-approved AI-applied slots across `Clear Draft` followed by `Generate Schedule`.
- Expanded visual regression to assert that applied AI habit, necessity, and task items remain visible after clear/regenerate.

## v1.0.4

- Persisted applied AI JSON schedule slots across `Clear Draft` followed by `Generate Schedule`, so approved AI placements remain part of future generated drafts.
- Updated planner engine slot-retention logic to preserve AI-applied managed slots even when they are not tied to deterministic task unit IDs.
- Added regression coverage for `apply AI JSON -> clear draft -> regenerate` to ensure habit placements (e.g., gym) are retained.

## v1.0.3

- Fixed planner draft reappearance bug by filtering hidden Google events using both `ignoredGoogleEventIds` and `dismissedGoogleCommitmentIds`.
- Updated deterministic draft generation to stop auto-injecting habit sessions, preventing forced back-to-back gym placement without AI planning.
- Expanded AI prompt context with explicit `habitRequirements` and rolling-day week metadata for Monday-Sunday frequency reasoning.
- Strengthened prompt rules for hard weekly caps and proportional partial-week caps.
- Tightened AI rolling-plan validation with unknown-habit detection, strict weekly habit-cap enforcement, and consecutive-day warnings.

## v1.0.2

- Fixed AI prompt-context leakage so removed/dismissed Google events are filtered out of `existingCalendarEvents` before prompt build.
- Updated AI prompt policy to explicitly forbid reintroducing dismissed Google events and to enforce one habit occurrence per day by default.
- Stopped AI prompt-capacity calculation from treating previous managed slots as hard locks, preventing stale gym/session carry-over in AI suggestions.
- Improved rolling-plan validation to check recurring commitments and reject duplicate same-day habit placements.
- Removed fragile habit session numbering in deterministic task expansion to avoid reversed `Session 3/2/1` display patterns.

## v1.0.1

- Fixed re-import loop for removed Google-imported commitments.
- Added persisted `dismissedGoogleCommitmentIds` in planner state so removed imported commitments stay removed across sync and generation.
- Updated Google commitment sync logic to skip dismissed event IDs and avoid re-inserting intentionally removed commitments.

## v1.0.0

- Reworked planner flow to align with the defined-elements model and AI-managed planning model.
- Added account-scoped Google event import into visible commitments so imported events can be edited directly in Step 1.
- Upgraded AI contract to `v3.0` with rolling 7-day plan output, minor goals, and tasks.
- Added deterministic validation guard for AI rolling-plan output before apply.
- Added AI planning attachment controls for user context (changes since last run, task progress notes, preference notes, priority major goal).
- Added AI-managed minor-goal and task lists in planner UI, with task status controls for progress signaling.

## v0.9.2

- Updated the AI prompt builder so detailed reasoning is requested outside the JSON patch.
- Added a structured response format with reasoning first and a fenced JSON patch last.
- Removed the soft import warning that expected reasoning inside the JSON `notes` field.
- Kept JSON import compatible with fenced JSON responses after reasoning text.

## v0.9.1

- Updated the AI prompt builder to require detailed reasoning inside the JSON `notes` field.
- Added prompt guidance for explaining operation choices, respected constraints, schedule-context effects, tradeoffs, and unscheduled limitations.
- Added a soft validation warning when imported AI JSON omits reasoning notes.
- Updated AI import summaries to indicate whether reasoning notes were included.

## v0.9.0

- Made planner draft schedule render the full rolling horizon day-by-day, including empty-day placeholders.
- Added commitment blocks directly into draft schedule cards so commitments remain visible in the generated timeline.
- Added planner-owned control for imported Google events in draft view with warning popup plus edit and remove actions.
- Updated commit flow to apply imported-event edits and removals to Google Calendar on commit.
- Enforced one-habit-per-day scheduling and strengthened preferred-window scoring to reduce odd same-day placements.
- Added visual test coverage for planner draft horizon rendering and imported-event remove controls.

## v0.8.2

- Moved `Connect Google` to global navigation so auth is always reachable even when planner content is locked.
- Added drawer-level `Connect Google` as the first mobile action item across pages.
- Removed the planner input status block and simplified the planner flow UI.
- Upgraded draft schedule rendering to a merged calendar-style preview that combines existing Google events and planned slots with status badges.

## v0.8.1

- Removed goal-only gating from draft generation so planner can run with empty goals, habits, and commitments.
- Added an in-page `Planner Input Status` notification block to explain missing setup while keeping generation available.
- Updated planner generation messaging to report open-hour drafts when no schedulable items are defined yet.
- Set weekday defaults by commitment type: weekly recurring defaults to Mon-Fri, date-range recurring defaults to all days.

## v0.8.0

- Reworked planner commitments UI with type-adaptive fields: one-off now hides weekdays, weekly keeps full weekday selection, and date-range enables weekday selection with range applicability rules.
- Replaced native weekday checkboxes with accessible glass-style day chips for cleaner mobile/desktop interaction.
- Added commitment validation layer to enforce type-specific requirements and clearer user-facing errors.
- Added planner cloud-sync client scaffold with conflict-aware push/pull flow tied to Google sign-in identity.
- Added Cloudflare Worker + D1 API scaffold for cross-device planner profile sync (`/api/planner/profile`).

## v0.7.0

- Unified planner commitment modeling into one configurable system (`weekly_recurring`, `date_range_recurring`, `one_off`) with contextual controls.
- Added multi-goal creation and custom habits/session creation in `What I Want`.
- Upgraded draft output to include a schedule-style day/time board, with text lists as secondary detail.
- Added sign-in-required planner gating with clear lock-state UI and account-scoped planner storage keys.
- Updated AI patch operations and prompt context to target goals, habits, commitments, and policy-safe updates.

## v0.6.0

- Upgraded Planner deterministic engine to rolling-horizon scheduling (default 7 days) with lock-window preservation for near-term slots.
- Added protected necessities and static date-range commitments so non-negotiable time is treated as hard blocks.
- Added replan-improvement behavior that preserves valid managed slots and reports kept/new/removed schedule metrics.
- Upgraded AI bridge prompt builder to include schedule context, hard blocks, and policy constraints.
- Switched AI import contract to validated patch operations (`operations[]`) for safer modifications.
- Refactored planner and shared styles/scripts into modular files to keep code files within the 300-line guideline.

## v0.5.0

- Added a manual AI-assist bridge in Planner Step 2 for copy/paste planning with any chatbot (non-API flow).
- Added strict AI JSON validation before import so malformed AI output is blocked before applying to state.
- Added prompt generator, parser, and apply workflow that maps AI output into goal/profile/minor goals/tasks/availability rules.
- Persisted AI-assist prompt/import state in planner storage so work can continue after refresh.
- Expanded visual checks to verify AI-assist UI presence in Planner Step 2 on both desktop and mobile.

## v0.4.4

- Removed the extra `OK` prefix so the connected button label now displays exactly `Google Connected`.
- Kept connected-state styling while simplifying wording across calendar and planner surfaces.

## v0.4.3

- Added intentional hover affordances for interactive UI elements on pointer-based devices (desktop/laptop) only.
- Introduced shared hover tokens in theme styles for consistent border, background, shadow, and lift behavior.
- Improved hover feedback across navbar links, drawer links, action buttons, step pills, and form controls where appropriate.
- Added desktop hover screenshot artifact coverage in the release visual test flow.

## v0.4.2

- Unified Google connect-button state rendering across `Today`, `Schedules`, and `Planner`.
- Shared persisted Google session restore across read and write calendar flows, including legacy write-token migration.
- Updated `Today` and `Schedules` connect behavior to avoid re-prompting when already signed in.
- Added release visual assertions that all three pages show `Google Connected` after restored auth session.

## v0.4.1

- Updated planner Google auth controls so `Connect Google` visibly changes to `Google Connected` after sign-in.
- Added explicit auth button visual states for connected, loading, idle, and error.
- Redesigned planner habit controls into modern switch-style toggles with improved readability and tap targets.
- Added dedicated planner step-2 screenshot coverage for both desktop and mobile visual checks.

## v0.4.0

- Replaced the planner layout with a 3-step quick wizard: `Life Constraints`, `What I Want`, and `Draft and Commit`.
- Added deterministic quick-profile inputs for wake/sleep rhythm, fixed commitments, and habit toggles.
- Added automatic availability derivation from fixed commitments to reduce planner setup friction.
- Added a shared planner view module to keep planner logic modular and below the line-count guideline.
- Updated release visual checks to validate planner stepper behavior on both desktop and mobile.

## v0.3.0

- Added a new `Planner` page and navigation entry across desktop and mobile.
- Added a deterministic planning engine with weekly minor goals, optional tasks, manual availability rules, and repeatable scoring.
- Added draft generation with unscheduled reasoning and overlap warning preview.
- Added explicit commit flow for writing planner draft events to Google Calendar with event upsert behavior.
- Upgraded planner Google integration to write-capable scope while preserving explicit user-triggered auth.

## v0.2.0

- Updated auth bootstrap behavior so Google sign-in popup no longer opens automatically on page load.
- Kept session restore for valid saved tokens, so events can still auto-load without interactive sign-in.
- Redesigned the UI with a Frutiger Aero-inspired glass and ocean visual theme for desktop and mobile.
- Preserved existing navigation and Google Calendar flows while refreshing visual styling.

## v0.1.1

- Added auth session persistence so Google Calendar access can be reused across page reloads for about one hour.
- Added automatic auth bootstrap and silent sign-in attempt on page load for both `Today` and `Schedules`.
- Added configurable auth session settings in `public/scripts/config.js` (`authPersistence`, `authDurationSeconds`, `refreshSkewSeconds`).
- Kept sign-out as a full session clear by removing stored token state from browser storage.

## v0.1.0

- Added Google Calendar integration scaffolding using Google Identity Services and Calendar API readonly access.
- Updated the `Today` page to show today-only events from Google Calendar after sign-in.
- Updated the `Schedules` page to show grouped upcoming events with selectable 7/14/30-day ranges.
- Added connect, refresh, and sign-out controls with clear loading/error/empty states.
- Expanded visual testing to capture desktop `Today`, desktop `Schedules`, mobile closed state, and mobile drawer-open state with versioned artifacts.

## v0.0.7

- Fixed the mobile menu trigger layout so the three bars stack vertically instead of rendering in a row.
- Preserved the cleaner equal-width `=`-style appearance while making the hamburger icon read correctly at a glance.

## v0.0.6

- Refined the mobile menu trigger into a cleaner three-line `=`-style icon.
- Tightened the hamburger spacing and made the bars more uniform for a more balanced appearance.

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
