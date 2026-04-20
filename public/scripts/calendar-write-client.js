import {
  clearPersistedSession,
  getPersistenceConfig,
  loadPersistedSession,
  savePersistedSession,
} from "./auth-session.js";
import { createCalendarCommitApi } from "./calendar-write-client-commit.js";

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
  "profile",
].join(" ");
const CONFIG = window.LIFEOS_CALENDAR_CONFIG ?? {};
const TEST_MODE = Boolean(CONFIG.testMode);
const TEST_ACCOUNT_KEY = String(CONFIG.testAccountKey || "test-user@lifeos.local").trim().toLowerCase() || "test-user@lifeos.local";
const TEST_AUTH_TOKEN = String(CONFIG.testAuthToken || `lifeos-test:${encodeURIComponent(TEST_ACCOUNT_KEY)}`);

const waitForGoogleIdentity = async (timeoutMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.google?.accounts?.oauth2) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

const clearWriteSession = () => {
  window.localStorage.removeItem("lifeos_google_calendar_write_auth_v1");
  window.sessionStorage.removeItem("lifeos_google_calendar_write_auth_v1");
  clearPersistedSession();
};

export const createCalendarWriteClient = ({ onStateChange }) => {
  const persistence = getPersistenceConfig(CONFIG);
  const state = {
    isConfigured: TEST_MODE || (typeof CONFIG.googleClientId === "string" && CONFIG.googleClientId.includes(".apps.googleusercontent.com")),
    isSignedIn: false,
    isLoading: false,
    error: "",
    accountKey: "anon",
  };
  let tokenClient = null;
  let accessToken = "";
  let expiresAt = 0;

  const emit = () => onStateChange?.({ ...state });
  const setError = (error) => { state.error = error; emit(); };
  const tokenValid = () => accessToken && expiresAt > Date.now() + persistence.refreshSkewSeconds * 1000;
  const activateTestSession = () => {
    accessToken = TEST_AUTH_TOKEN;
    expiresAt = Date.now() + 24 * 3600 * 1000;
    state.isSignedIn = true;
    state.accountKey = TEST_ACCOUNT_KEY;
    state.error = "";
  };
  const clearSession = () => {
    accessToken = "";
    expiresAt = 0;
    state.isSignedIn = false;
    state.accountKey = "anon";
    clearWriteSession();
  };

  const resolveAccountKey = async () => {
    if (TEST_MODE) return TEST_ACCOUNT_KEY;
    if (!tokenValid()) return "anon";
    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) return "anon";
      const payload = await response.json();
      return String(payload.email || "").trim().toLowerCase() || "anon";
    } catch {
      return "anon";
    }
  };

  const restore = async () => {
    if (TEST_MODE) {
      activateTestSession();
      emit();
      return true;
    }
    const saved = loadPersistedSession(persistence.mode);
    if (!saved || typeof saved.accessToken !== "string" || typeof saved.expiresAt !== "number") return false;
    if (saved.expiresAt <= Date.now()) {
      clearSession();
      return false;
    }
    accessToken = saved.accessToken;
    expiresAt = saved.expiresAt;
    state.isSignedIn = true;
    emit();
    resolveAccountKey().then((key) => {
      if (!key || key === "anon") {
        clearSession();
        setError("Google session expired. Please reconnect.");
        return;
      }
      state.accountKey = key;
      emit();
    });
    return true;
  };

  const ensureClient = async () => {
    if (TEST_MODE) return null;
    if (!state.isConfigured) throw new Error("Google write integration is not configured.");
    if (tokenClient) return tokenClient;
    if (!(await waitForGoogleIdentity())) throw new Error("Google Identity Services failed to load.");
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: GOOGLE_SCOPE,
      callback: () => {},
      error_callback: () => setError("Google authentication failed."),
    });
    return tokenClient;
  };

  const requestToken = async (prompt = "consent", silent = false) => {
    if (TEST_MODE) {
      state.isLoading = false;
      activateTestSession();
      emit();
      return accessToken;
    }
    const client = await ensureClient();
    state.isLoading = true;
    setError("");
    return new Promise((resolve, reject) => {
      client.callback = async (response) => {
        state.isLoading = false;
        if (!response || response.error || !response.access_token) {
          clearSession();
          emit();
          const fallbackError = silent ? "Silent sign-in not available. Please reconnect Google." : "Unable to get calendar write token.";
          reject(new Error(response?.error || fallbackError));
          return;
        }
        accessToken = response.access_token;
        const expiresIn = Number(response.expires_in) || persistence.durationSeconds;
        expiresAt = Date.now() + expiresIn * 1000;
        savePersistedSession(persistence.mode, { accessToken, expiresAt });
        (persistence.mode === "session" ? window.sessionStorage : window.localStorage).setItem("lifeos_google_calendar_write_auth_v1", JSON.stringify({ accessToken, expiresAt }));
        state.isSignedIn = true;
        emit();
        resolveAccountKey().then((key) => {
          state.accountKey = key || "anon";
          emit();
        });
        resolve(accessToken);
      };
      client.requestAccessToken({ prompt });
    });
  };

  const ensureSignedIn = async () => {
    if (TEST_MODE) {
      if (!tokenValid()) activateTestSession();
      state.isSignedIn = true;
      state.accountKey = TEST_ACCOUNT_KEY;
      emit();
      return accessToken;
    }
    if (tokenValid()) return accessToken;
    try {
      return await requestToken("", true);
    } catch {
      return requestToken("consent");
    }
  };

  const getAccessToken = async ({ interactive = false, forceRefresh = false } = {}) => {
    if (TEST_MODE) {
      if (forceRefresh || !tokenValid()) activateTestSession();
      return accessToken;
    }
    if (!forceRefresh && tokenValid()) return accessToken;
    if (!interactive) return "";
    if (forceRefresh) return requestToken("consent");
    return ensureSignedIn();
  };

  const { fetchExistingEvents, commitDraft, commitRollingWindow } = createCalendarCommitApi({
    TEST_MODE,
    CONFIG,
    GOOGLE_API_BASE,
    ensureSignedIn,
    clearSession,
    emit,
  });

  const signOut = () => {
    if (TEST_MODE) {
      clearSession();
      emit();
      return;
    }
    if (accessToken && window.google?.accounts?.oauth2?.revoke) window.google.accounts.oauth2.revoke(accessToken);
    clearSession();
    emit();
  };

  restore().finally(() => emit());

  return {
    connect: async () => requestToken("consent"),
    signOut,
    fetchExistingEvents,
    commitDraft,
    commitRollingWindow,
    resolveAccountKey,
    getAccessToken,
    getState: () => ({ ...state }),
    setError,
  };
};
