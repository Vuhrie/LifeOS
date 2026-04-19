const params = new URLSearchParams(window.location.search);
const host = String(window.location.hostname || "").trim().toLowerCase();
const isLocalDevHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
const hasDeveloperTestFlag = window.localStorage.getItem("lifeos_dev_test_mode") === "1";
const testModeRequested = params.get("testMode") === "1";
const testMode = isLocalDevHost && hasDeveloperTestFlag && testModeRequested;
const defaultTestUser = "test-user@lifeos.local";
const requestedTestUser = String(params.get("testUser") || "").trim().toLowerCase();
const testUser = testMode && requestedTestUser ? requestedTestUser : defaultTestUser;
const testAuthToken = testMode ? `lifeos-test:${encodeURIComponent(testUser)}` : "";

window.LIFEOS_CALENDAR_CONFIG = {
  googleClientId: "1020356343759-l4ulfkao5ing0kcfp2t8j5kv2l2hq5ke.apps.googleusercontent.com",
  calendarId: "primary",
  authPersistence: "local",
  authDurationSeconds: 3600,
  refreshSkewSeconds: 120,
  testMode,
  testAccountKey: testUser,
  testAuthToken,
};

window.LIFEOS_PLANNER_SYNC_CONFIG = {
  apiBaseUrl: "https://lifeos-planner-sync.derpdiepie8523.workers.dev/api/planner",
  testMode,
};
