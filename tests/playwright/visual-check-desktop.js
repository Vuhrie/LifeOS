const { runDesktopPlannerCore } = require("./visual-check-desktop-planner-core.js");
const { runDesktopPlannerAiAndSettings } = require("./visual-check-desktop-planner-ai.js");
const { takeShot } = require("./visual-check-common.js");

const runDesktopChecks = async ({
  browser,
  releaseVersion,
  screenshotsDir,
  wait,
  isoDate,
  seededToken,
  seededEmail,
  seededEventsPayload,
}) => {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
  const desktopBrand = await desktop.locator(".brand").textContent();
  const desktopLinks = await desktop.locator(".desktop-nav .nav-link").allTextContents();
  const desktopMenuVisible = await desktop.locator(".menu-button").isVisible();
  const todayTitle = await desktop.locator("#today-title").textContent();
  const todayStatus = await desktop.locator("#calendar-status").textContent();
  if (desktopBrand !== `LifeOS ${releaseVersion}`) throw new Error(`Unexpected desktop brand: ${desktopBrand}`);
  if (desktopLinks.join(", ") !== "Today, Schedules, Planner, Setting") {
    throw new Error(`Unexpected desktop links: ${desktopLinks.join(", ")}`);
  }
  if (desktopMenuVisible) throw new Error("Mobile menu button should be hidden on desktop.");
  if (todayTitle !== "Today") throw new Error(`Unexpected Today title: ${todayTitle}`);
  if (!todayStatus?.includes("Connect your Google account")) {
    throw new Error(`Unexpected Today status on load: ${todayStatus}`);
  }
  await takeShot(desktop, screenshotsDir, "visual-test-desktop", releaseVersion);

  await desktop.evaluate((token) => {
    window.localStorage.setItem("lifeos_google_calendar_auth_v1", JSON.stringify(token));
    window.localStorage.setItem("lifeos_google_calendar_write_auth_v1", JSON.stringify(token));
  }, seededToken);
  await desktop.route("https://www.googleapis.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/oauth2/v3/userinfo")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ email: seededEmail }) });
      return;
    }
    if (url.includes("/calendar/v3/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(seededEventsPayload) });
      return;
    }
    await route.continue();
  });
  await desktop.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
  const connectedTodayText = await desktop.locator("#connect-google").textContent();
  if (!connectedTodayText?.includes(seededEmail)) {
    throw new Error(`Today connect button should show account email. Found: ${connectedTodayText}`);
  }

  await desktop.goto("http://127.0.0.1:4173/schedules.html", { waitUntil: "networkidle" });
  const schedulesTitle = await desktop.locator("#schedules-title").textContent();
  const schedulesStatus = await desktop.locator("#calendar-status").textContent();
  const connectedSchedulesText = await desktop.locator("#connect-google").textContent();
  if (schedulesTitle !== "Schedules") throw new Error(`Unexpected Schedules title: ${schedulesTitle}`);
  if (!connectedSchedulesText?.includes(seededEmail)) {
    throw new Error(`Schedules connect button should show account email. Found: ${connectedSchedulesText}`);
  }
  if (!schedulesStatus?.includes("Showing events") && !schedulesStatus?.includes("No events")) {
    throw new Error(`Unexpected Schedules status with restored session: ${schedulesStatus}`);
  }
  await takeShot(desktop, screenshotsDir, "visual-test-desktop-schedules", releaseVersion);

  const { rollingPlan } = await runDesktopPlannerCore({
    desktop,
    releaseVersion,
    screenshotsDir,
    wait,
    isoDate,
  });

  await runDesktopPlannerAiAndSettings({
    desktop,
    releaseVersion,
    screenshotsDir,
    wait,
    seededEmail,
    rollingPlan,
  });
};

module.exports = {
  runDesktopChecks,
};
