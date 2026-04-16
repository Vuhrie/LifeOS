const { chromium, devices } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");
const screenshotsDir = path.join(rootDir, "tests", "visual", "screenshots");
const releaseVersion = "v0.9.2";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const lockCount = await desktop.locator("#planner-lock").count();
    if (!horizonVisible || !commitmentsVisible || lockCount !== 1) {
      throw new Error("Planner step 1 should include horizon + unified commitments + lock overlay element.");
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
    await desktop.locator('.step-pill[data-step="3"]').click();
    await desktop.locator("#generate-draft").click();
    await wait(200);
    const noGoalStatus = await desktop.locator("#planner-status").textContent();
    if (!noGoalStatus?.includes("open hours")) {
      throw new Error(`Planner should generate without goals and show open-hours status. Found: ${noGoalStatus}`);
    }
    const previewCardCount = await desktop.locator(".draft-event-card").count();
    const previewText = await desktop.locator("#draft-schedule").innerText();
    const previewDayCount = await desktop.locator(".draft-day-group").count();
    const importedEditCount = await desktop.locator("[data-edit-imported]").count();
    const importedRemoveCount = await desktop.locator("[data-rm-imported]").count();
    if (previewCardCount < 1 || !previewText.includes("Existing Calendar Event")) {
      throw new Error("Planner draft preview should include merged existing calendar event cards.");
    }
    if (previewDayCount !== 7) {
      throw new Error(`Planner draft should render the full 7-day horizon. Found: ${previewDayCount}`);
    }
    if (importedRemoveCount < 1) {
      throw new Error("Planner draft should allow removing imported events.");
    }
    if (importedEditCount < 1) {
      throw new Error("Planner draft should allow editing imported events.");
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
    if (!builtPrompt.includes("Reasoning must be outside the JSON in a clearly organized section.")) {
      throw new Error("AI prompt should require organized reasoning outside JSON.");
    }
    if (!builtPrompt.includes("Put the JSON patch last in a fenced ```json block")) {
      throw new Error("AI prompt should require fenced JSON after reasoning.");
    }
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


