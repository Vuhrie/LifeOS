const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");

const { buildSeededGoogleContext, isoDate, wait } = require("./visual-check-common.js");
const { runDesktopChecks } = require("./visual-check-desktop.js");
const { runMobileChecks } = require("./visual-check-mobile.js");

const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");
const screenshotsDir = path.join(rootDir, "tests", "visual", "screenshots");
const releaseVersion = "v1.0.34";

const run = async () => {
  const server = spawn("python", ["-m", "http.server", "4173"], {
    cwd: publicDir,
    stdio: "ignore",
  });

  try {
    await wait(2000);
    const browser = await chromium.launch({ headless: true });
    const seededContext = buildSeededGoogleContext();
    await runDesktopChecks({
      browser,
      releaseVersion,
      screenshotsDir,
      wait,
      isoDate,
      seededToken: seededContext.seededToken,
      seededEmail: seededContext.seededEmail,
      seededEventsPayload: seededContext.seededEventsPayload,
    });
    await runMobileChecks({
      browser,
      releaseVersion,
      screenshotsDir,
      wait,
      seededToken: seededContext.seededToken,
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
