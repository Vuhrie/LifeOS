const path = require("node:path");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildSeededGoogleContext = () => {
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
  return {
    seededToken,
    seededEmail: "vuhrie@example.com",
    seededEventsPayload,
  };
};

const takeShot = async (page, screenshotsDir, name, releaseVersion) => {
  await page.screenshot({
    path: path.join(screenshotsDir, `${name}-current.png`),
    fullPage: true,
  });
  await page.screenshot({
    path: path.join(screenshotsDir, `${name}-${releaseVersion}.png`),
    fullPage: true,
  });
};

module.exports = {
  wait,
  isoDate,
  buildSeededGoogleContext,
  takeShot,
};
