const { chromium, devices } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");
const screenshotsDir = path.join(rootDir, "tests", "visual", "screenshots");
const releaseVersion = "v1.0.10";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const run = async () => {
  const server = spawn("python", ["-m", "http.server", "4173"], {
    cwd: publicDir,
    stdio: "ignore",
  });

  try {
    await wait(2000);

    const browser = await chromium.launch({ headless: true });

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
    const desktopBrand = await desktop.locator(".brand").textContent();
    const desktopLinks = await desktop.locator(".desktop-nav .nav-link").allTextContents();
    const desktopMenuVisible = await desktop.locator(".menu-button").isVisible();
    const todayTitle = await desktop.locator("#today-title").textContent();
    const todayStatus = await desktop.locator("#calendar-status").textContent();
    if (desktopBrand !== `LifeOS ${releaseVersion}`) {
      throw new Error(`Unexpected desktop brand: ${desktopBrand}`);
    }
    if (desktopLinks.join(", ") !== "Today, Schedules, Planner, Setting") {
      throw new Error(`Unexpected desktop links: ${desktopLinks.join(", ")}`);
    }
    if (desktopMenuVisible) {
      throw new Error("Mobile menu button should be hidden on desktop.");
    }
    if (todayTitle !== "Today") {
      throw new Error(`Unexpected Today title: ${todayTitle}`);
    }
    if (!todayStatus?.includes("Connect your Google account")) {
      throw new Error(`Unexpected Today status on load: ${todayStatus}`);
    }
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-${releaseVersion}.png`),
      fullPage: true,
    });
    const seededToken = { accessToken: "seeded-token", expiresAt: Date.now() + 3600_000 };
    const seededStart = new Date();
    seededStart.setDate(seededStart.getDate() + 1);
    seededStart.setHours(9, 0, 0, 0);
    const seededEnd = new Date(seededStart);
    seededEnd.setHours(10, 0, 0, 0);
    const seededEventsPayload = {
      items: [
        {
          id: "existing_event_1",
          summary: "Existing Calendar Event",
          start: { dateTime: seededStart.toISOString() },
          end: { dateTime: seededEnd.toISOString() },
          description: "from_google",
        },
      ],
    };
    await desktop.evaluate((token) => {
      window.localStorage.setItem("lifeos_google_calendar_auth_v1", JSON.stringify(token));
      window.localStorage.setItem("lifeos_google_calendar_write_auth_v1", JSON.stringify(token));
    }, seededToken);
    await desktop.route("https://www.googleapis.com/calendar/v3/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(seededEventsPayload),
      });
    });
    await desktop.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
    const connectedTodayText = await desktop.locator("#connect-google").textContent();
    if (!connectedTodayText?.includes("Google Connected")) {
      throw new Error(`Today connect button should show connected state. Found: ${connectedTodayText}`);
    }

    await desktop.goto("http://127.0.0.1:4173/schedules.html", { waitUntil: "networkidle" });
    const schedulesTitle = await desktop.locator("#schedules-title").textContent();
    const schedulesStatus = await desktop.locator("#calendar-status").textContent();
    const connectedSchedulesText = await desktop.locator("#connect-google").textContent();
    if (schedulesTitle !== "Schedules") {
      throw new Error(`Unexpected Schedules title: ${schedulesTitle}`);
    }
    if (!connectedSchedulesText?.includes("Google Connected")) {
      throw new Error(`Schedules connect button should show connected state. Found: ${connectedSchedulesText}`);
    }
    if (!schedulesStatus?.includes("Showing events") && !schedulesStatus?.includes("No events")) {
      throw new Error(`Unexpected Schedules status with restored session: ${schedulesStatus}`);
    }
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-schedules-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-schedules-${releaseVersion}.png`),
      fullPage: true,
    });

    await desktop.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "domcontentloaded" });
    const plannerTitle = await desktop.locator("#planner-title").textContent();
    const plannerSteps = await desktop.locator(".step-pill").count();
    const firstStepActive = await desktop.locator('.step-pill[data-step="1"]').evaluate((element) =>
      element.classList.contains("is-active"),
    );
    if (plannerTitle !== "Planner") {
      throw new Error(`Unexpected Planner title: ${plannerTitle}`);
    }
    if (plannerSteps !== 3) {
      throw new Error(`Planner should have 3 step pills. Found: ${plannerSteps}`);
    }
    if (!firstStepActive) {
      throw new Error("Planner should open on step 1.");
    }
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
    if (!commitButtonStep1Hidden) {
      throw new Error("Commit button should only be visible in step 3.");
    }
    if (commitProgressPanelPresent !== 1) {
      throw new Error("Commit progress panel should be present in planner.");
    }
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-planner-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-planner-${releaseVersion}.png`),
      fullPage: true,
    });
    await wait(250);
    const dayWrapInitialHidden = await desktop.locator("#commitment-day-wrap").isHidden();
    const dateRangeInitialHidden = await desktop.locator("#commitment-date-range-row").isHidden();
    const weekdaysInitialVisible = await desktop.locator("#commitment-weekdays").isVisible();
    const weeklySelectedCount = await desktop.locator(".day-chip.is-selected").count();
    if (!dayWrapInitialHidden || !dateRangeInitialHidden || !weekdaysInitialVisible) {
      throw new Error("Weekly recurring mode should show weekdays only.");
    }
    if (weeklySelectedCount !== 5) {
      throw new Error(`Weekly recurring should default to Mon-Fri selected. Found: ${weeklySelectedCount}`);
    }
    const importedCommitmentItem = desktop.locator("#commitments-list li", { hasText: "Existing Calendar Event" });
    if (await importedCommitmentItem.count()) {
      await importedCommitmentItem.locator('[data-rm-commitment]').first().click();
      await wait(150);
    }
    const noticeCount = await desktop.locator("#planner-input-notice").count();
    if (noticeCount !== 0) {
      throw new Error("Planner input notice block should be removed.");
    }
    await desktop.selectOption("#commitment-type", "one_off");
    const dayWrapOneOffVisible = await desktop.locator("#commitment-day-wrap").isVisible();
    const weekdaysOneOffHidden = await desktop.locator("#commitment-weekdays").isHidden();
    if (!dayWrapOneOffVisible || !weekdaysOneOffHidden) {
      throw new Error("One-off mode should show date field and hide weekdays.");
    }
    await desktop.selectOption("#commitment-type", "date_range_recurring");
    const dateRangeSelectedCount = await desktop.locator(".day-chip.is-selected").count();
    if (dateRangeSelectedCount !== 7) {
      throw new Error(`Date-range recurring should default all weekdays selected. Found: ${dateRangeSelectedCount}`);
    }
    await desktop.fill("#commitment-start-date", "2026-04-14");
    await desktop.fill("#commitment-end-date", "2026-04-14");
    await wait(100);
    const disabledDayCount = await desktop.locator(".day-chip.is-disabled").count();
    if (disabledDayCount < 6) {
      throw new Error(`Date-range applicability should disable non-applicable weekdays. Found disabled count: ${disabledDayCount}`);
    }
    await desktop.selectOption("#commitment-type", "weekly_recurring");
    await desktop.locator('.step-pill[data-step="2"]').click();
    await wait(100);
    await desktop.fill("#habit-name", "Regression Gym Habit");
    await desktop.fill("#habit-frequency", "3");
    await desktop.fill("#habit-duration", "60");
    await desktop.selectOption("#habit-window", "morning");
    await desktop.locator("#add-habit").click();
    await wait(100);
    await desktop.locator('.step-pill[data-step="3"]').click();
    const commitButtonStep3Visible = await desktop.locator("#commit-draft").isVisible();
    if (!commitButtonStep3Visible) {
      throw new Error("Commit button should be visible in step 3.");
    }
    await desktop.locator("#generate-draft").click();
    await wait(200);
    const reimportedCommitmentCount = await desktop.locator("#commitments-list li", { hasText: "Existing Calendar Event" }).count();
    if (reimportedCommitmentCount > 0) {
      throw new Error("Removed imported commitment should not be reinserted after generate.");
    }
    const noGoalStatus = await desktop.locator("#planner-status").textContent();
    if (!noGoalStatus?.includes("open hours")) {
      throw new Error(`Planner should generate without goals and show open-hours status. Found: ${noGoalStatus}`);
    }
    const previewText = await desktop.locator("#draft-schedule").innerText();
    const previewDayCount = await desktop.locator(".draft-day-group").count();
    if (previewText.includes("Existing Calendar Event")) {
      throw new Error("Removed imported commitment/event should not remain in draft preview.");
    }
    if (previewText.includes("Regression Gym Habit")) {
      throw new Error("Deterministic draft should not auto-place habit sessions without AI plan import.");
    }
    if (!previewText.includes("Daily Rhythm")) {
      throw new Error("Generated draft should render daily rhythm blocks.");
    }
    if (previewDayCount !== 7) {
      throw new Error(`Planner draft should render the full 7-day horizon. Found: ${previewDayCount}`);
    }
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-planner-draft-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-planner-draft-${releaseVersion}.png`),
      fullPage: true,
    });
    await desktop.locator('.step-pill[data-step="2"]').click();
    await wait(200);
    const aiAssistTitle = await desktop.locator("#ai-assist-title").textContent();
    const aiPromptField = await desktop.locator("#ai-prompt-output").isVisible();
    const aiImportField = await desktop.locator("#ai-import-input").isVisible();
    if (aiAssistTitle !== "AI Assist (Manual Patch Import)") {
      throw new Error(`Unexpected AI assist title: ${aiAssistTitle}`);
    }
    if (!aiPromptField || !aiImportField) {
      throw new Error("AI assist fields should be visible in planner step 2 on desktop.");
    }
    await desktop.locator("#ai-build-prompt").click();
    await wait(200);
    const builtPrompt = await desktop.locator("#ai-prompt-output").inputValue();
    if (!builtPrompt.includes("Provide organized reasoning OUTSIDE JSON first.")) {
      throw new Error("AI prompt should require reasoning outside JSON.");
    }
    if (!builtPrompt.includes("\"rollingPlan\"")) {
      throw new Error("AI prompt should include rollingPlan JSON shape.");
    }
    if (!builtPrompt.includes("\"necessityDefinitions\"") || !builtPrompt.includes("\"necessityDurationByType\"")) {
      throw new Error("AI prompt should include necessity definitions and duration context.");
    }
    if (!builtPrompt.includes("Morning Shower") || !builtPrompt.includes("Night Shower")) {
      throw new Error("AI prompt should include split morning/night shower necessity definitions.");
    }
    if (!builtPrompt.includes("\"dailyRhythmByDay\"")) {
      throw new Error("AI prompt should include per-day daily rhythm context.");
    }
    if (builtPrompt.includes("Existing Calendar Event")) {
      throw new Error("Removed imported events should not reappear in AI prompt context.");
    }
    if (!builtPrompt.includes("frequencyPerWeek is a hard cap per Monday-Sunday week")) {
      throw new Error("AI prompt should enforce Monday-Sunday hard cap for habits.");
    }
    if (!builtPrompt.includes("proportional cap")) {
      throw new Error("AI prompt should include proportional partial-week habit cap guidance.");
    }
    if (!builtPrompt.includes("\"habitRequirements\"")) {
      throw new Error("AI prompt context should include habitRequirements.");
    }
    if (!builtPrompt.includes("Habit duration is fixed by habit definition durationMinutes")) {
      throw new Error("AI prompt should state that habit duration is fixed by definition.");
    }
    if (!builtPrompt.includes("existingCalendarEvents are informational context only")) {
      throw new Error("AI prompt should clarify existing calendar events are informational only.");
    }
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
    const appliedPlan = {
      version: "3.0",
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
    if (!aiAppliedDraftText.includes("Regression Gym Habit")) {
      throw new Error("Applied AI rolling plan should render habit item in draft.");
    }
    if (!aiAppliedDraftText.includes("AI Morning Prep") || !aiAppliedDraftText.includes("Regression Focus Task")) {
      throw new Error("Applied AI rolling plan should render non-habit items in draft.");
    }
    await desktop.locator("#clear-draft").click();
    await wait(120);
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
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-planner-step2-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-planner-step2-${releaseVersion}.png`),
      fullPage: true,
    });
    await desktop.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "domcontentloaded" });
    const connectButtonText = await desktop.locator("#connect-google").textContent();
    if (!connectButtonText?.includes("Google Connected")) {
      throw new Error(`Planner connect button should show connected state. Found: ${connectButtonText}`);
    }
    await desktop.hover("#connect-google");
    await wait(120);
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-hover-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-hover-${releaseVersion}.png`),
      fullPage: true,
    });
    await desktop.unroute("https://www.googleapis.com/calendar/v3/**");
    await desktop.evaluate(() => {
      window.localStorage.removeItem("lifeos_google_calendar_auth_v1");
      window.localStorage.removeItem("lifeos_google_calendar_write_auth_v1");
    });

    const mobile = await browser.newPage({ ...devices["iPhone 13"] });
    await mobile.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
    const mobileBrand = await mobile.locator(".brand").textContent();
    const mobileNavVisible = await mobile.locator(".desktop-nav").isVisible();
    const mobileMenuVisible = await mobile.locator(".menu-button").isVisible();
    const mobileMenuLines = await mobile.locator(".menu-button span").count();
    await mobile.screenshot({
      path: path.join(screenshotsDir, "visual-test-mobile-current.png"),
      fullPage: true,
    });
    await mobile.screenshot({
      path: path.join(screenshotsDir, `visual-test-mobile-${releaseVersion}.png`),
      fullPage: true,
    });
    await mobile.locator(".menu-button").click();
    await wait(300);
    const drawerOpen = await mobile.locator(".drawer").evaluate((element) => element.classList.contains("is-open"));
    const drawerHeader = await mobile.locator(".drawer-brand").textContent();
    const drawerVersion = await mobile.locator(".drawer-version").textContent();
    const drawerLinks = await mobile.locator(".drawer-link-label").allTextContents();
    if (mobileBrand !== `LifeOS ${releaseVersion}`) {
      throw new Error(`Unexpected mobile brand: ${mobileBrand}`);
    }
    if (mobileNavVisible) {
      throw new Error("Desktop navigation should be hidden on mobile.");
    }
    if (!mobileMenuVisible) {
      throw new Error("Mobile menu button should be visible on mobile.");
    }
    if (mobileMenuLines !== 3) {
      throw new Error(`Mobile menu button should show three lines. Found: ${mobileMenuLines}`);
    }
    if (!drawerOpen) {
      throw new Error("Mobile drawer did not open.");
    }
    if (drawerHeader !== "LifeOS" || drawerVersion !== releaseVersion) {
      throw new Error(`Unexpected drawer header: ${drawerHeader} ${drawerVersion}`);
    }
    if (drawerLinks.join(", ") !== "Today, Schedules, Planner, Setting") {
      throw new Error(`Unexpected mobile drawer links: ${drawerLinks.join(", ")}`);
    }
    const drawerBox = await mobile.locator(".drawer-panel").boundingBox();
    if (!drawerBox || Math.abs(drawerBox.x) > 1 || drawerBox.width < 280) {
      throw new Error(`Unexpected mobile drawer panel geometry: ${JSON.stringify(drawerBox)}`);
    }
    await mobile.screenshot({
      path: path.join(screenshotsDir, "visual-test-mobile-open-current.png"),
      fullPage: true,
    });
    await mobile.screenshot({
      path: path.join(screenshotsDir, `visual-test-mobile-open-${releaseVersion}.png`),
      fullPage: true,
    });

    await mobile.evaluate((token) => {
      window.localStorage.setItem("lifeos_google_calendar_auth_v1", JSON.stringify(token));
      window.localStorage.setItem("lifeos_google_calendar_write_auth_v1", JSON.stringify(token));
    }, seededToken);
    await mobile.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "domcontentloaded" });
    const mobilePlannerSteps = await mobile.locator(".step-pill").count();
    if (mobilePlannerSteps !== 3) {
      throw new Error(`Planner mobile should have 3 step pills. Found: ${mobilePlannerSteps}`);
    }
    const mobileHorizonVisible = await mobile.locator("#horizon-days").isVisible();
    if (!mobileHorizonVisible) {
      throw new Error("Planner mobile should show rolling horizon input.");
    }
    await mobile.selectOption("#commitment-type", "one_off");
    const mobileWeekdaysHidden = await mobile.locator("#commitment-weekdays").isHidden();
    if (!mobileWeekdaysHidden) {
      throw new Error("Planner mobile one-off mode should hide weekdays.");
    }
    await mobile.selectOption("#commitment-type", "weekly_recurring");
    await mobile.screenshot({
      path: path.join(screenshotsDir, "visual-test-mobile-planner-current.png"),
      fullPage: true,
    });
    await mobile.screenshot({
      path: path.join(screenshotsDir, `visual-test-mobile-planner-${releaseVersion}.png`),
      fullPage: true,
    });
    await mobile.locator('.step-pill[data-step="2"]').click();
    await wait(200);
    const mobileAiAssistVisible = await mobile.locator("#ai-assist-title").isVisible();
    if (!mobileAiAssistVisible) {
      throw new Error("AI assist section should be visible in planner step 2 on mobile.");
    }
    await mobile.screenshot({
      path: path.join(screenshotsDir, "visual-test-mobile-planner-step2-current.png"),
      fullPage: true,
    });
    await mobile.screenshot({
      path: path.join(screenshotsDir, `visual-test-mobile-planner-step2-${releaseVersion}.png`),
      fullPage: true,
    });

    await browser.close();
  } finally {
    server.kill();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});



