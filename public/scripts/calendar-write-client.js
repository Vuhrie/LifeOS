import {
  clearPersistedSession,
  getPersistenceConfig,
  loadPersistedSession,
  savePersistedSession,
} from "./auth-session.js";

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_KEY = "lifeos_google_calendar_write_auth_v1";
const CONFIG = window.LIFEOS_CALENDAR_CONFIG ?? {};

const waitForGoogleIdentity = async (timeoutMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.google?.accounts?.oauth2) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

const loadWriteSession = (mode) => {
  try {
    const raw = (mode === "session" ? window.sessionStorage : window.localStorage).getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveWriteSession = (mode, payload) => {
  (mode === "session" ? window.sessionStorage : window.localStorage).setItem(TOKEN_KEY, JSON.stringify(payload));
};

const clearWriteSession = () => {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  clearPersistedSession();
};

const parseCalendarEvent = (event) => ({
  id: event.id,
  title: event.summary || "",
  start: event.start?.dateTime || event.start?.date || "",
  end: event.end?.dateTime || event.end?.date || "",
  description: event.description || "",
});

export const createCalendarWriteClient = ({ onStateChange }) => {
  const persistence = getPersistenceConfig(CONFIG);
  const state = {
    isConfigured: typeof CONFIG.googleClientId === "string" && CONFIG.googleClientId.includes(".apps.googleusercontent.com"),
    isSignedIn: false,
    isLoading: false,
    error: "",
  };

  let tokenClient = null;
  let accessToken = "";
  let expiresAt = 0;

  const emit = () => onStateChange?.({ ...state });
  const setError = (error) => {
    state.error = error;
    emit();
  };

  const clearSession = () => {
    accessToken = "";
    expiresAt = 0;
    state.isSignedIn = false;
    clearWriteSession();
  };

  const tokenValid = () => accessToken && expiresAt > Date.now() + persistence.refreshSkewSeconds * 1000;

  const restore = () => {
    const saved = loadWriteSession(persistence.mode);
    if (!saved || typeof saved.accessToken !== "string" || typeof saved.expiresAt !== "number") {
      return false;
    }
    if (saved.expiresAt <= Date.now()) {
      clearSession();
      return false;
    }
    accessToken = saved.accessToken;
    expiresAt = saved.expiresAt;
    state.isSignedIn = true;
    emit();
    return true;
  };

  const ensureClient = async () => {
    if (!state.isConfigured) {
      throw new Error("Google write integration is not configured.");
    }
    if (tokenClient) {
      return tokenClient;
    }
    const loaded = await waitForGoogleIdentity();
    if (!loaded) {
      throw new Error("Google Identity Services failed to load.");
    }
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: GOOGLE_SCOPE,
      callback: () => {},
      error_callback: () => setError("Google authentication failed."),
    });
    return tokenClient;
  };

  const requestToken = async (prompt = "consent") => {
    const client = await ensureClient();
    state.isLoading = true;
    setError("");
    return new Promise((resolve, reject) => {
      client.callback = (response) => {
        state.isLoading = false;
        if (!response || response.error || !response.access_token) {
          clearSession();
          emit();
          reject(new Error(response?.error || "Unable to get calendar write token."));
          return;
        }
        accessToken = response.access_token;
        const expiresIn = Number(response.expires_in) || persistence.durationSeconds;
        expiresAt = Date.now() + expiresIn * 1000;
        saveWriteSession(persistence.mode, { accessToken, expiresAt });
        state.isSignedIn = true;
        emit();
        resolve(accessToken);
      };
      client.requestAccessToken({ prompt });
    });
  };

  const ensureSignedIn = async () => {
    if (tokenValid()) {
      return accessToken;
    }
    return requestToken("consent");
  };

  const fetchExistingEvents = async ({ startIso, endIso }) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: startIso,
      timeMax: endIso,
      maxResults: "500",
    });
    const response = await fetch(`${GOOGLE_API_BASE}/calendars/${calendarId}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearSession();
        emit();
      }
      throw new Error(`Failed to fetch existing events (${response.status}).`);
    }
    const payload = await response.json();
    return (payload.items || []).map(parseCalendarEvent);
  };

  const upsertEvent = async ({ slot, commitId }) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const descriptor = `lifeos_slot_id:${slot.id}`;
    const searchStart = new Date(slot.start);
    searchStart.setDate(searchStart.getDate() - 1);
    const searchEnd = new Date(slot.end);
    searchEnd.setDate(searchEnd.getDate() + 1);
    const existing = await fetchExistingEvents({
      startIso: searchStart.toISOString(),
      endIso: searchEnd.toISOString(),
    });
    const matching = existing.find((event) => (event.description || "").includes(descriptor));

    const payload = {
      summary: `[LifeOS] ${slot.title}`,
      description: `${descriptor}\nlifeos_commit_id:${commitId}`,
      start: { dateTime: slot.start.toISOString() },
      end: { dateTime: slot.end.toISOString() },
    };

    const url = matching
      ? `${GOOGLE_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(matching.id)}`
      : `${GOOGLE_API_BASE}/calendars/${calendarId}/events`;
    const method = matching ? "PATCH" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Failed to ${matching ? "update" : "create"} event (${response.status}).`);
    }
    const data = await response.json();
    return { id: data.id, title: data.summary || payload.summary, slotId: slot.id };
  };

  const commitDraft = async (slots) => {
    const commitId = `commit_${Date.now().toString(36)}`;
    const writes = [];
    for (const slot of slots) {
      const written = await upsertEvent({ slot, commitId });
      writes.push(written);
    }
    return { commitId, writes };
  };

  const connect = async () => requestToken("consent");

  const signOut = () => {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(accessToken);
    }
    clearSession();
    emit();
  };

  restore();
  emit();

  return {
    connect,
    signOut,
    fetchExistingEvents,
    commitDraft,
    getState: () => ({ ...state }),
    setError,
  };
};
