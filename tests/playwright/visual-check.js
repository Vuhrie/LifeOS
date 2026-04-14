const { chromium, devices } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");
const screenshotsDir = path.join(rootDir, "tests", "visual", "screenshots");
const releaseVersion = "v0.2.0";

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
    if (desktopLinks.join(", ") !== "Today, Schedules, Setting") {
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

    await desktop.goto("http://127.0.0.1:4173/schedules.html", { waitUntil: "networkidle" });
    const schedulesTitle = await desktop.locator("#schedules-title").textContent();
    const schedulesStatus = await desktop.locator("#calendar-status").textContent();
    if (schedulesTitle !== "Schedules") {
      throw new Error(`Unexpected Schedules title: ${schedulesTitle}`);
    }
    if (!schedulesStatus?.includes("Connect your Google account")) {
      throw new Error(`Unexpected Schedules status on load: ${schedulesStatus}`);
    }
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-schedules-current.png"),
      fullPage: true,
    });
    await desktop.screenshot({
      path: path.join(screenshotsDir, `visual-test-desktop-schedules-${releaseVersion}.png`),
      fullPage: true,
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
    if (drawerLinks.join(", ") !== "Today, Schedules, Setting") {
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

    await browser.close();
  } finally {
    server.kill();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
