const { takeShot } = require("./visual-check-common.js");

const runDesktopPlannerAiAndSettings = async ({
  desktop,
  releaseVersion,
  screenshotsDir,
  wait,
  seededEmail,
  rollingPlan,
}) => {
  await desktop.locator('.step-pill[data-step="2"]').click();
  await wait(200);
  const aiAssistTitle = await desktop.locator("#ai-assist-title").textContent();
  const aiPromptField = await desktop.locator("#ai-prompt-output").isVisible();
  const aiImportField = await desktop.locator("#ai-import-input").isVisible();
  if (aiAssistTitle !== "AI Assist (Manual Patch Import)") {
    throw new Error(`Unexpected AI assist title: ${aiAssistTitle}`);
  }
  if (!aiPromptField || !aiImportField) throw new Error("AI assist fields should be visible in planner step 2 on desktop.");
  await desktop.locator("#ai-build-prompt").click();
  await wait(200);
  const builtPrompt = await desktop.locator("#ai-prompt-output").inputValue();
  if (!builtPrompt.includes("Provide organized reasoning OUTSIDE JSON first.")) throw new Error("AI prompt should require reasoning outside JSON.");
  if (!builtPrompt.includes('"status": "in_progress"') || !builtPrompt.includes('"status": "schedule_ready"')) {
    throw new Error("AI prompt should include conversational status flow.");
  }
  if (!builtPrompt.includes("\"rollingPlan\"")) throw new Error("AI prompt should include rollingPlan JSON shape.");
  if (builtPrompt.includes("\"majorGoalProposals\"")) throw new Error("Rolling AI prompt should not include majorGoalProposals JSON shape.");
  if (!builtPrompt.includes("\"necessityDefinitions\"") || !builtPrompt.includes("\"necessityDurationByType\"")) {
    throw new Error("AI prompt should include necessity definitions and duration context.");
  }
  if (!builtPrompt.includes("Morning Shower") || !builtPrompt.includes("Night Shower")) {
    throw new Error("AI prompt should include split morning/night shower necessity definitions.");
  }
  if (!builtPrompt.includes("\"dailyRhythmByDay\"")) throw new Error("AI prompt should include per-day daily rhythm context.");
  if (builtPrompt.includes("Existing Calendar Event")) throw new Error("Removed imported events should not reappear in AI prompt context.");
  if (!builtPrompt.includes("frequencyPerWeek is a hard cap per Monday-Sunday week")) {
    throw new Error("AI prompt should enforce Monday-Sunday hard cap for habits.");
  }
  if (!builtPrompt.includes("proportional cap")) throw new Error("AI prompt should include proportional partial-week habit cap guidance.");
  if (!builtPrompt.includes("\"habitRequirements\"")) throw new Error("AI prompt context should include habitRequirements.");
  if (!builtPrompt.includes("Habit duration is fixed by habit definition durationMinutes")) {
    throw new Error("AI prompt should state that habit duration is fixed by definition.");
  }
  if (!builtPrompt.includes("existingCalendarEvents are informational context only")) {
    throw new Error("AI prompt should clarify existing calendar events are informational only.");
  }
  if (!builtPrompt.includes("Major goals contain outcome, deadline, and importance only")) {
    throw new Error("AI prompt should clarify major goals are importance-based without weekly-hour targets.");
  }
  if (!builtPrompt.includes("Open time is not automatically work time")) throw new Error("AI prompt should protect free time by default.");
  if (!builtPrompt.includes("Include Lunch when midday capacity is free")) throw new Error("AI prompt should include lunch guidance.");
  if (!builtPrompt.includes("rest and free_time")) throw new Error("AI prompt should include rest/free_time guidance.");

  const inProgressPlan = {
    version: "3.1",
    status: "in_progress",
    questions: ["Should lunch be explicit on CHFI days?"],
    assumptions: [],
    concerns: [],
    workingPlan: { minorGoals: [], tasks: [], rollingPlan: [] },
  };
  await desktop.fill("#ai-import-input", JSON.stringify(inProgressPlan, null, 2));
  await desktop.locator("#ai-validate-import").click();
  await wait(120);
  const inProgressStatus = await desktop.locator("#ai-assist-status").textContent();
  const inProgressApplyDisabled = await desktop.locator("#ai-apply-import").isDisabled();
  if (!inProgressApplyDisabled) throw new Error("Apply should stay disabled for in_progress schedule JSON.");
  if (!inProgressStatus?.toLowerCase().includes("still in progress")) {
    throw new Error(`Expected in_progress status guidance. Found: ${inProgressStatus}`);
  }

  const appliedPlan = {
    version: "3.1",
    status: "schedule_ready",
    minorGoals: [],
    tasks: [],
    rollingPlan,
  };
  await desktop.fill("#ai-import-input", JSON.stringify(appliedPlan, null, 2));
  await desktop.locator("#ai-validate-import").click();
  await wait(120);
  await desktop.locator("#ai-apply-import").click();
  await wait(180);
  await desktop.locator('.step-pill[data-step="3"]').click();
  await wait(150);
  const aiAppliedDraftText = await desktop.locator("#draft-schedule").innerText();
  if (!aiAppliedDraftText.includes("No schedule generated")) {
    throw new Error("Applied AI rolling plan should not auto-create a persisted draft preview.");
  }
  await desktop.locator("#generate-draft").click();
  await wait(220);
  const regeneratedDraftText = await desktop.locator("#draft-schedule").innerText();
  if (!regeneratedDraftText.includes("Regression Gym Habit")) {
    throw new Error("Generate Draft should retain previously applied AI JSON schedule items.");
  }
  if (!regeneratedDraftText.includes("AI Morning Prep") || !regeneratedDraftText.includes("Regression Focus Task")) {
    throw new Error("Generate Draft should retain applied AI necessity/task items.");
  }
  await desktop.locator('.step-pill[data-step="2"]').click();
  await wait(120);
  await takeShot(desktop, screenshotsDir, "visual-test-desktop-planner-step2", releaseVersion);

  await desktop.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "domcontentloaded" });
  const connectButtonText = await desktop.locator("#connect-google").textContent();
  if (!connectButtonText?.includes(seededEmail)) {
    throw new Error(`Planner connect button should show account email. Found: ${connectButtonText}`);
  }
  await desktop.goto("http://127.0.0.1:4173/setting.html", { waitUntil: "domcontentloaded" });
  await wait(160);
  const settingsEmail = await desktop.locator("#account-email").textContent();
  const settingsSignOutEnabled = await desktop.locator("#sign-out").isEnabled();
  const settingsSyncCardVisible = await desktop.locator("#cloud-sync-title").isVisible();
  const settingsSyncNowVisible = await desktop.locator("#sync-now").isVisible();
  if (!settingsEmail?.includes(seededEmail) || !settingsSignOutEnabled) {
    throw new Error(`Settings should show signed-in email and enabled sign-out. Found email=${settingsEmail}, enabled=${settingsSignOutEnabled}`);
  }
  if (!settingsSyncCardVisible || !settingsSyncNowVisible) {
    throw new Error("Settings should show cloud sync card and Sync Now control.");
  }
  await desktop.locator("#sign-out").click();
  await wait(160);
  const settingsEmailAfterSignOut = await desktop.locator("#account-email").textContent();
  if (settingsEmailAfterSignOut !== "Not connected") {
    throw new Error(`Settings should show disconnected state after sign-out. Found: ${settingsEmailAfterSignOut}`);
  }
  await takeShot(desktop, screenshotsDir, "visual-test-desktop-settings", releaseVersion);
  await desktop.hover("#connect-google");
  await wait(120);
  await takeShot(desktop, screenshotsDir, "visual-test-desktop-hover", releaseVersion);
  await desktop.unroute("https://www.googleapis.com/**");
  await desktop.evaluate(() => {
    window.localStorage.removeItem("lifeos_google_calendar_auth_v1");
    window.localStorage.removeItem("lifeos_google_calendar_write_auth_v1");
  });
};

module.exports = {
  runDesktopPlannerAiAndSettings,
};
