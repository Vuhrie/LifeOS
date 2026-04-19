const params = new URLSearchParams(window.location.search);
const testMode = params.get("testMode") === "1";
const defaultTestUser = "test-user@lifeos.local";
const requestedTestUser = String(params.get("testUser") || "").trim().toLowerCase();
const testUser = requestedTestUser || defaultTestUser;

window.LIFEOS_CALENDAR_CONFIG = {
  googleClientId: "1020356343759-l4ulfkao5ing0kcfp2t8j5kv2l2hq5ke.apps.googleusercontent.com",
  calendarId: "primary",
  authPersistence: "local",
  authDurationSeconds: 3600,
  refreshSkewSeconds: 120,
  testMode,
  testAccountKey: testUser,
  testAuthToken: `lifeos-test:${encodeURIComponent(testUser)}`,
};

window.LIFEOS_PLANNER_SYNC_CONFIG = {
  apiBaseUrl: "https://lifeos-planner-sync.derpdiepie8523.workers.dev/api/planner",
  testMode,
};
