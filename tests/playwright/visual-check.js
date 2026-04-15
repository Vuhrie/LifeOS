const { chromium, devices } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");
const screenshotsDir = path.join(rootDir, "tests", "visual", "screenshots");
const releaseVersion = "v0.4.4";

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
    await desktop.evaluate((token) => {
      window.localStorage.setItem("lifeos_google_calendar_auth_v1", JSON.stringify(token));
    }, seededToken);
    await desktop.route("https://www.googleapis.com/calendar/v3/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
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

    await desktop.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "networkidle" });
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
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-planner-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-planner-${releaseVersion}.png`),
      fullPage: true,
    });
    await desktop.locator('.step-pill[data-step="2"]').click();
    await wait(200);
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-planner-step2-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-planner-step2-${releaseVersion}.png`),
      fullPage: true,
    });
    await desktop.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "networkidle" });
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

    await mobile.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "networkidle" });
    const mobilePlannerSteps = await mobile.locator(".step-pill").count();
    if (mobilePlannerSteps !== 3) {
      throw new Error(`Planner mobile should have 3 step pills. Found: ${mobilePlannerSteps}`);
    }
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
