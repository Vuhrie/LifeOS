const { chromium, devices } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");
const screenshotsDir = path.join(rootDir, "tests", "visual", "screenshots");

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
    if (desktopBrand !== "LifeOS v0.0.3") {
      throw new Error(`Unexpected desktop brand: ${desktopBrand}`);
    }
    if (desktopLinks.join(", ") !== "Today, Schedules, Setting") {
      throw new Error(`Unexpected desktop links: ${desktopLinks.join(", ")}`);
    }
    if (desktopMenuVisible) {
      throw new Error("Mobile menu button should be hidden on desktop.");
    }
    await desktop.screenshot({
      path: path.join(screenshotsDir, "visual-test-desktop-current.png"),
      fullPage: true,
    });

    const mobile = await browser.newPage({ ...devices["iPhone 13"] });
    await mobile.goto("http://127.0.0.1:4173/index.html", { waitUntil: "networkidle" });
    const mobileBrand = await mobile.locator(".brand").textContent();
    const mobileNavVisible = await mobile.locator(".desktop-nav").isVisible();
    const mobileMenuVisible = await mobile.locator(".menu-button").isVisible();
    await mobile.locator(".menu-button").click();
    const drawerOpen = await mobile.locator(".drawer").evaluate((element) => element.classList.contains("is-open"));
    const drawerLinks = await mobile.locator(".drawer-link").allTextContents();
    if (mobileBrand !== "LifeOS v0.0.3") {
      throw new Error(`Unexpected mobile brand: ${mobileBrand}`);
    }
    if (mobileNavVisible) {
      throw new Error("Desktop navigation should be hidden on mobile.");
    }
    if (!mobileMenuVisible) {
      throw new Error("Mobile menu button should be visible on mobile.");
    }
    if (!drawerOpen) {
      throw new Error("Mobile drawer did not open.");
    }
    if (drawerLinks.join(", ") !== "Today, Schedules, Setting") {
      throw new Error(`Unexpected mobile drawer links: ${drawerLinks.join(", ")}`);
    }
    await mobile.screenshot({
      path: path.join(screenshotsDir, "visual-test-mobile-current.png"),
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
