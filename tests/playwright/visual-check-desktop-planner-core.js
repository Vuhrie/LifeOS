const { takeShot } = require("./visual-check-common.js");

const runDesktopPlannerCore = async ({
  desktop,
  releaseVersion,
  screenshotsDir,
  wait,
  isoDate,
}) => {
  await desktop.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "domcontentloaded" });
  const plannerTitle = await desktop.locator("#planner-title").textContent();
  const plannerSteps = await desktop.locator(".step-pill").count();
  const firstStepActive = await desktop.locator('.step-pill[data-step="1"]').evaluate((element) =>
    element.classList.contains("is-active"));
  if (plannerTitle !== "Planner") throw new Error(`Unexpected Planner title: ${plannerTitle}`);
  if (plannerSteps !== 3) throw new Error(`Planner should have 3 step pills. Found: ${plannerSteps}`);
  if (!firstStepActive) throw new Error("Planner should open on step 1.");
  const horizonVisible = await desktop.locator("#horizon-days").isVisible();
  const commitmentsVisible = await desktop.locator("#add-commitment").isVisible();
  const commitButtonStep1Hidden = await desktop.locator("#commit-draft").isHidden();
  const morningShowerVisible = await desktop.locator("#need-morning-shower").isVisible();
  const nightShowerVisible = await desktop.locator("#need-night-shower").isVisible();
  const commitProgressPanelPresent = await desktop.locator("#commit-progress").count();
  const lockCount = await desktop.locator("#planner-lock").count();
  if (!horizonVisible || !commitmentsVisible || !morningShowerVisible || !nightShowerVisible || lockCount !== 1) {
    throw new Error("Planner step 1 should include horizon + unified commitments + lock overlay element.");
  }
  if (!commitButtonStep1Hidden) throw new Error("Commit button should only be visible in step 3.");
  if (commitProgressPanelPresent !== 1) throw new Error("Commit progress panel should be present in planner.");
  const cleanupSeed = await desktop.evaluate(() => {
    const key = Object.keys(window.localStorage)
      .find((item) => item.startsWith("lifeos_planner_state_v2_")) || "lifeos_planner_state_v2_anon";
    const state = JSON.parse(window.localStorage.getItem(key) || '{"schemaVersion":12,"currentWeekKey":"","weeks":{},"history":[]}');
    const weekKey = state.currentWeekKey || Object.keys(state.weeks || {})[0] || "visual-cleanup-week";
    const existingWeek = state.weeks?.[weekKey] || {};
    state.currentWeekKey = weekKey;
    state.weeks = {
      ...(state.weeks || {}),
      [weekKey]: {
        ...existingWeek,
        goals: [],
        minorGoals: [{ id: "mgoal_removed_visual", majorGoalId: "goal_removed_visual", title: "Removed Visual Minor Goal", source: "ai" }],
        tasks: [{
          id: "task_removed_visual",
          title: "Removed Visual Task",
          minorGoalId: "mgoal_removed_visual",
          estimateMinutes: 45,
          priority: 3,
          energy: "deep",
          source: "ai",
        }],
        draft: { preview: { days: [] }, slots: [] },
      },
    };
    window.localStorage.setItem(key, JSON.stringify(state));
    return { key, weekKey };
  });
  await desktop.reload({ waitUntil: "domcontentloaded" });
  await wait(150);
  const staleTaskText = await desktop.locator("#tasks-list").innerText();
  if (staleTaskText.includes("Removed Visual Task")) {
    throw new Error("Planner should clean stale AI tasks after their Major Goal was removed.");
  }
  const cleanupPersisted = await desktop.evaluate(({ key, weekKey }) => {
    const state = JSON.parse(window.localStorage.getItem(key) || "{}");
    return { tasks: state.weeks?.[weekKey]?.tasks || [], minorGoals: state.weeks?.[weekKey]?.minorGoals || [], draft: state.weeks?.[weekKey]?.draft || null };
  }, cleanupSeed);
  if (cleanupPersisted.tasks.length || cleanupPersisted.minorGoals.length || cleanupPersisted.draft) {
    throw new Error("Planner cleanup should persist removed orphan AI work and clear stale draft data.");
  }
  await takeShot(desktop, screenshotsDir, "visual-test-desktop-planner", releaseVersion);
  await wait(250);
  const dayWrapInitialHidden = await desktop.locator("#commitment-day-wrap").isHidden();
  const dateRangeInitialHidden = await desktop.locator("#commitment-date-range-row").isHidden();
  const weekdaysInitialVisible = await desktop.locator("#commitment-weekdays").isVisible();
  const weeklySelectedCount = await desktop.locator("#commitment-days .day-chip.is-selected").count();
  if (!dayWrapInitialHidden || !dateRangeInitialHidden || !weekdaysInitialVisible) {
    throw new Error("Weekly recurring mode should show weekdays only.");
  }
  if (weeklySelectedCount !== 5) throw new Error(`Weekly recurring should default to Mon-Fri selected. Found: ${weeklySelectedCount}`);
  const importedCommitmentItem = desktop.locator("#commitments-list li", { hasText: "Existing Calendar Event" });
  if (await importedCommitmentItem.count()) {
    await importedCommitmentItem.locator("[data-rm-commitment]").first().click();
    await wait(150);
  }
  const noticeCount = await desktop.locator("#planner-input-notice").count();
  if (noticeCount !== 0) throw new Error("Planner input notice block should be removed.");
  await desktop.selectOption("#commitment-type", "one_off");
  const dayWrapOneOffVisible = await desktop.locator("#commitment-day-wrap").isVisible();
  const weekdaysOneOffHidden = await desktop.locator("#commitment-weekdays").isHidden();
  if (!dayWrapOneOffVisible || !weekdaysOneOffHidden) throw new Error("One-off mode should show date field and hide weekdays.");
  await desktop.selectOption("#commitment-type", "date_range_recurring");
  const dateRangeSelectedCount = await desktop.locator("#commitment-days .day-chip.is-selected").count();
  if (dateRangeSelectedCount !== 7) throw new Error(`Date-range recurring should default all weekdays selected. Found: ${dateRangeSelectedCount}`);
  await desktop.fill("#commitment-start-date", "2026-04-14");
  await desktop.fill("#commitment-end-date", "2026-04-14");
  await wait(100);
  const disabledDayCount = await desktop.locator(".day-chip.is-disabled").count();
  if (disabledDayCount < 6) throw new Error(`Date-range applicability should disable non-applicable weekdays. Found disabled count: ${disabledDayCount}`);
  await desktop.selectOption("#commitment-type", "weekly_recurring");
  await desktop.locator('.step-pill[data-step="2"]').click();
  await wait(100);
  const manualMajorModeSelected = await desktop.locator('[data-major-goal-mode="manual"]').evaluate((element) =>
    element.classList.contains("is-selected"));
  const aiMajorModeSelected = await desktop.locator('[data-major-goal-mode="ai_assisted"]').evaluate((element) =>
    element.classList.contains("is-selected"));
  const manualGoalFieldsHidden = await desktop.locator("#major-goal-manual-fields").isHidden();
  const aiGoalFieldsHidden = await desktop.locator("#major-goal-ai-fields").isHidden();
  if (manualMajorModeSelected || aiMajorModeSelected || !manualGoalFieldsHidden || !aiGoalFieldsHidden) {
    throw new Error("Major goal mode should start neutral with both mode panels hidden.");
  }
  await desktop.locator('[data-major-goal-mode="manual"]').click();
  await wait(80);
  const manualGoalFieldsVisible = await desktop.locator("#major-goal-manual-fields").isVisible();
  if (!manualGoalFieldsVisible) throw new Error("Manual major-goal fields should be visible after selecting Manual mode.");
  const weeklyHoursInputCount = await desktop.locator("#goal-weekly-hours").count();
  if (weeklyHoursInputCount !== 0) throw new Error("Major goals should not require a weekly-hours input.");
  await desktop.locator('[data-major-goal-mode="ai_assisted"]').click();
  await wait(100);
  const aiGoalFieldsVisible = await desktop.locator("#major-goal-ai-fields").isVisible();
  if (!aiGoalFieldsVisible) throw new Error("AI-assisted major-goal fields should be visible after selecting AI Assisted mode.");
  const saveAiDraftButtonCount = await desktop.locator("#add-goal-ai-seed").count();
  if (saveAiDraftButtonCount !== 0) throw new Error("Save AI-Assisted Draft button should not exist.");
  await desktop.fill("#goal-ai-title", "Get good at cybersecurity");
  await desktop.fill("#goal-ai-notes", "Prefer certificate-driven progression.");
  await desktop.locator("#major-goal-ai-build-prompt").click();
  await wait(150);
  const majorGoalBuildStatus = await desktop.locator("#major-goal-ai-status").textContent();
  if (!majorGoalBuildStatus?.toLowerCase().includes("built")) {
    throw new Error(`Major-goal build status should confirm success. Found: ${majorGoalBuildStatus}`);
  }
  const aiDraftCount = await desktop.locator("#goals-list li", { hasText: "AI draft" }).count();
  if (!aiDraftCount) throw new Error("Build Major Goal Prompt should auto-save current AI-assisted draft when needed.");
  const majorGoalPrompt = await desktop.locator("#major-goal-ai-prompt-output").inputValue();
  if (!majorGoalPrompt.includes("major-goals-v1")) throw new Error("Major-goal AI prompt should include major-goals-v1 contract.");
  if (!majorGoalPrompt.includes("Questions For You") || !majorGoalPrompt.includes("Working Major Goal Draft")) {
    throw new Error("Major-goal AI prompt should require question-first conversation with a working draft.");
  }
  if (!majorGoalPrompt.includes('"status":"in_progress"')) throw new Error("Major-goal AI prompt should include in_progress working draft status.");
  if (!majorGoalPrompt.includes("importance")) throw new Error("Major-goal AI prompt should use importance.");
  if (majorGoalPrompt.includes('"weeklyHours":')) throw new Error("Major-goal AI prompt should not include weeklyHours fields.");
  if (majorGoalPrompt.includes("each proposal must include seedId, title, deadline, priority, weeklyHours")) {
    throw new Error("Major-goal AI prompt should not require weeklyHours.");
  }
  if (majorGoalPrompt.includes("\"rollingPlan\"")) throw new Error("Major-goal AI prompt should not include rollingPlan output.");
  if (!majorGoalPrompt.includes("Do not generate minor goals")) throw new Error("Major-goal AI prompt should restrict scope to major goals only.");
  await desktop.locator('[data-major-goal-mode="manual"]').click();
  await wait(80);
  await desktop.fill("#habit-name", "Regression Gym Habit");
  await desktop.fill("#habit-frequency", "3");
  await desktop.fill("#habit-duration", "60");
  await desktop.selectOption("#habit-window", "morning");
  await desktop.locator("#add-habit").click();
  await wait(100);
  await desktop.locator('.step-pill[data-step="3"]').click();
  const commitButtonStep3Visible = await desktop.locator("#commit-draft").isVisible();
  if (!commitButtonStep3Visible) throw new Error("Commit button should be visible in step 3.");
  await desktop.locator("#generate-draft").click();
  await wait(200);
  const reimportedCommitmentCount = await desktop.locator("#commitments-list li", { hasText: "Existing Calendar Event" }).count();
  if (reimportedCommitmentCount > 0) throw new Error("Removed imported commitment should not be reinserted after generate.");
  const noGoalStatus = await desktop.locator("#planner-status").textContent();
  if (!noGoalStatus?.includes("Schedule generated")) {
    throw new Error(`Planner should generate a deterministic draft successfully. Found: ${noGoalStatus}`);
  }
  const previewText = await desktop.locator("#draft-schedule").innerText();
  const previewDayCount = await desktop.locator(".draft-day-group").count();
  if (previewText.includes("Existing Calendar Event")) throw new Error("Removed imported commitment/event should not remain in draft preview.");
  if (!previewText.includes("Regression Gym Habit")) throw new Error("Deterministic draft should schedule configured habits from current planner definitions.");
  if (!previewText.includes("Daily Rhythm")) throw new Error("Generated draft should render daily rhythm blocks.");
  if (previewDayCount !== 7) throw new Error(`Planner draft should render the full 7-day horizon. Found: ${previewDayCount}`);
  await takeShot(desktop, screenshotsDir, "visual-test-desktop-planner-draft", releaseVersion);

  const rollingStart = new Date();
  rollingStart.setHours(0, 0, 0, 0);
  rollingStart.setDate(rollingStart.getDate() + 1);
  const rollingPlan = Array.from({ length: 7 }).map((_, offset) => {
    const date = new Date(rollingStart);
    date.setDate(rollingStart.getDate() + offset);
    return {
      date: isoDate(date),
      items: offset === 0
        ? [
          { type: "necessity", title: "AI Morning Prep", start: "06:30", end: "07:15" },
          { type: "habit", title: "Regression Gym Habit", start: "08:15", end: "09:15" },
          { type: "task", title: "Regression Focus Task", start: "19:00", end: "19:45" },
        ]
        : [],
    };
  });
  return { rollingPlan };
};

module.exports = {
  runDesktopPlannerCore,
};
