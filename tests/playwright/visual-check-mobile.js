const { devices } = require("playwright");
const { takeShot } = require("./visual-check-common.js");

const runMobileChecks = async ({
  browser,
  releaseVersion,
  screenshotsDir,
  wait,
  seededToken,
}) => {
  const mobile = await browser.newPage({ ...devices["iPhone 13"] });
  await mobile.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
  const mobileBrand = await mobile.locator(".brand").textContent();
  const mobileNavVisible = await mobile.locator(".desktop-nav").isVisible();
  const mobileMenuVisible = await mobile.locator(".menu-button").isVisible();
  const mobileMenuLines = await mobile.locator(".menu-button span").count();
  await takeShot(mobile, screenshotsDir, "visual-test-mobile", releaseVersion);
  await mobile.locator(".menu-button").click();
  await wait(300);
  const drawerOpen = await mobile.locator(".drawer").evaluate((element) => element.classList.contains("is-open"));
  const drawerHeader = await mobile.locator(".drawer-brand").textContent();
  const drawerVersion = await mobile.locator(".drawer-version").textContent();
  const drawerLinks = await mobile.locator(".drawer-link-label").allTextContents();
  if (mobileBrand !== `LifeOS ${releaseVersion}`) throw new Error(`Unexpected mobile brand: ${mobileBrand}`);
  if (mobileNavVisible) throw new Error("Desktop navigation should be hidden on mobile.");
  if (!mobileMenuVisible) throw new Error("Mobile menu button should be visible on mobile.");
  if (mobileMenuLines !== 3) throw new Error(`Mobile menu button should show three lines. Found: ${mobileMenuLines}`);
  if (!drawerOpen) throw new Error("Mobile drawer did not open.");
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
  await takeShot(mobile, screenshotsDir, "visual-test-mobile-open", releaseVersion);

  await mobile.evaluate((token) => {
    window.localStorage.setItem("lifeos_google_calendar_auth_v1", JSON.stringify(token));
    window.localStorage.setItem("lifeos_google_calendar_write_auth_v1", JSON.stringify(token));
  }, seededToken);
  await mobile.goto("http://127.0.0.1:4173/planner.html", { waitUntil: "domcontentloaded" });
  const mobilePlannerSteps = await mobile.locator(".step-pill").count();
  if (mobilePlannerSteps !== 3) throw new Error(`Planner mobile should have 3 step pills. Found: ${mobilePlannerSteps}`);
  const mobileHorizonVisible = await mobile.locator("#horizon-days").isVisible();
  if (!mobileHorizonVisible) throw new Error("Planner mobile should show rolling horizon input.");
  await mobile.selectOption("#commitment-type", "one_off");
  const mobileWeekdaysHidden = await mobile.locator("#commitment-weekdays").isHidden();
  if (!mobileWeekdaysHidden) throw new Error("Planner mobile one-off mode should hide weekdays.");
  await mobile.selectOption("#commitment-type", "weekly_recurring");
  await takeShot(mobile, screenshotsDir, "visual-test-mobile-planner", releaseVersion);
  await mobile.locator('.step-pill[data-step="2"]').click();
  await wait(200);
  const mobileAiAssistVisible = await mobile.locator("#ai-assist-title").isVisible();
  if (!mobileAiAssistVisible) throw new Error("AI assist section should be visible in planner step 2 on mobile.");
  await takeShot(mobile, screenshotsDir, "visual-test-mobile-planner-step2", releaseVersion);
  await mobile.goto("http://127.0.0.1:4173/setting.html", { waitUntil: "domcontentloaded" });
  await wait(120);
  await takeShot(mobile, screenshotsDir, "visual-test-mobile-settings", releaseVersion);
};

module.exports = {
  runMobileChecks,
};
