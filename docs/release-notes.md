# Release Notes

## v1.0.34

- Enforced strict 300-line cap across active code modules with no oversize allowlist exceptions.
- Split oversized planner/controller and visual-check flows into focused modules for clearer ownership and maintainability.
- Added stricter AGENTS compliance guard behavior so oversized files are blocked immediately.
- Updated code hierarchy documentation to reflect the new modular structure.

## v1.0.33

- Added planner test mode (`planner.html?testMode=1` and `planner-test.html`) that skips Google sign-in while keeping planner behavior and cloud sync flows active.
- Added test-token authentication support in the planner sync Worker (`lifeos-test:<account>`) behind `ALLOW_TEST_AUTH`.
- Added test-mode auth/session behavior in calendar write client so planner can run and sync without Google OAuth or Google Calendar imports.
- Updated sync-client messaging and headers for test-mode cloud runs.

## v1.0.32

- Fixed stale planner-logic state after account/cloud week reload by rebuilding planner logic with the latest active week reference.
- Fixed AI-applied schedule persistence so `persistedFromAiApply` managed habit slots are retained through local normalization and cloud sync sanitization.
- Restored Generate Schedule behavior consistency so applied schedule JSON data (minor goals, tasks, and non-Google AI-managed slots) remains available to draft generation after sync/reload flows.

## v1.0.31

- Updated `Generate Schedule` to prioritize the full last-applied AI schedule slots within the rolling 7-day window.
- Ensured generated draft includes pasted-and-applied AI plan content (tasks, habits, rest, free_time, and other managed slots) rather than collapsing back to deterministic-only output.
- Kept Google schedule import excluded from generation preview inputs; only planner-owned commitments and applied AI-managed slots are used.

## v1.0.30

- Fixed schedule JSON import parsing to select the last fenced JSON block instead of the first.
- Prevented false applies where in-progress/template JSON was parsed ahead of the actual `schedule_ready` payload.
- Restored reliable minor-goal/task ingestion when chatbot responses contain multiple fenced JSON blocks.

## v1.0.29

- Clarified schedule prompt-builder semantics so commitments and goals are explicitly treated as different purpose classes.
- Added hard prompt instructions that commitments are forced obligations, while major goals/minor goals/tasks are achievement-oriented work.
- Added prompt guidance to prevent collapsing goals/tasks into commitments even when they share domain overlap.
- Added prompt guidance to account for stress/workload when commitments and goals are in a similar vein.

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

See older `v0.x` releases in [release-notes-v0.md](./release-notes-v0.md).
