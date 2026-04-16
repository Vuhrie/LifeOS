import {
  clearPersistedSession,
  getPersistenceConfig,
  loadPersistedSession,
  savePersistedSession,
} from "./auth-session.js";

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CONFIG = window.LIFEOS_CALENDAR_CONFIG ?? {};

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

const parseCalendarEvent = (event) => ({
  id: event.id,
  title: event.summary || "",
  start: event.start?.dateTime || event.start?.date || "",
  end: event.end?.dateTime || event.end?.date || "",
  description: event.description || "",
});

const toIso = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const createCalendarWriteClient = ({ onStateChange }) => {
  const persistence = getPersistenceConfig(CONFIG);
  const state = {
    isConfigured: typeof CONFIG.googleClientId === "string" && CONFIG.googleClientId.includes(".apps.googleusercontent.com"),
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

  const clearSession = () => {
    accessToken = "";
    expiresAt = 0;
    state.isSignedIn = false;
    state.accountKey = "anon";
    clearWriteSession();
  };

  const resolveAccountKey = async () => {
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
      state.accountKey = key || "anon";
      emit();
    });
    return true;
  };

  const ensureClient = async () => {
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

  const requestToken = async (prompt = "consent") => {
    const client = await ensureClient();
    state.isLoading = true;
    setError("");
    return new Promise((resolve, reject) => {
      client.callback = async (response) => {
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

  const ensureSignedIn = async () => (tokenValid() ? accessToken : requestToken("consent"));
  const getAccessToken = async ({ interactive = false } = {}) => {
    if (tokenValid()) return accessToken;
    if (!interactive) return "";
    return ensureSignedIn();
  };

  const fetchExistingEvents = async ({ startIso, endIso }) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin: startIso, timeMax: endIso, maxResults: "500" });
    const response = await fetch(`${GOOGLE_API_BASE}/calendars/${calendarId}/events?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) { clearSession(); emit(); }
      throw new Error(`Failed to fetch existing events (${response.status}).`);
    }
    const payload = await response.json();
    return (payload.items || []).map(parseCalendarEvent);
  };

  const upsertEvent = async ({ slot, commitId }) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const descriptor = `lifeos_slot_id:${slot.id}`;
    const searchStart = new Date(slot.start); searchStart.setDate(searchStart.getDate() - 1);
    const searchEnd = new Date(slot.end); searchEnd.setDate(searchEnd.getDate() + 1);
    const existing = await fetchExistingEvents({ startIso: searchStart.toISOString(), endIso: searchEnd.toISOString() });
    const matching = existing.find((event) => (event.description || "").includes(descriptor));
    const payload = {
      summary: `[LifeOS] ${slot.title}`,
      description: `${descriptor}\nlifeos_commit_id:${commitId}`,
      start: { dateTime: slot.start.toISOString() },
      end: { dateTime: slot.end.toISOString() },
    };
    const url = matching ? `${GOOGLE_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(matching.id)}` : `${GOOGLE_API_BASE}/calendars/${calendarId}/events`;
    const method = matching ? "PATCH" : "POST";
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Failed to ${matching ? "update" : "create"} event (${response.status}).`);
    const data = await response.json();
    return { id: data.id, title: data.summary || payload.summary, slotId: slot.id };
  };

  const deleteEvent = async (eventId) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const response = await fetch(
      `${GOOGLE_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to remove event (${response.status}).`);
    }
  };

  const updateEventById = async (event) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const payload = {
      summary: String(event.title || "Updated event"),
      description: String(event.description || ""),
      start: { dateTime: new Date(event.start).toISOString() },
      end: { dateTime: new Date(event.end).toISOString() },
    };
    const response = await fetch(
      `${GOOGLE_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(event.id)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw new Error(`Failed to update event (${response.status}).`);
  };

  const insertCommitItem = async ({ item, commitId }) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const payload = {
      summary: String(item.title || "LifeOS Event"),
      description: String(item.description || ""),
      start: { dateTime: toIso(item.start) },
      end: { dateTime: toIso(item.end) },
      extendedProperties: {
        private: {
          lifeosManaged: "true",
          lifeosCommitId: String(commitId),
          lifeosSourceId: String(item.sourceId || item.id || ""),
          lifeosType: String(item.type || "planned"),
        },
      },
    };
    const response = await fetch(
      `${GOOGLE_API_BASE}/calendars/${calendarId}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw new Error(`Failed to create event (${response.status}).`);
    const data = await response.json();
    return { id: data.id, title: data.summary || payload.summary };
  };

  const commitDraft = async (slots, { deleteEventIds = [], updateEvents = [] } = {}) => {
    const commitId = `commit_${Date.now().toString(36)}`;
    const writes = [];
    const deletes = [];
    const updates = [];
    for (const eventId of deleteEventIds) {
      await deleteEvent(eventId);
      deletes.push(eventId);
    }
    for (const event of updateEvents) {
      await updateEventById(event);
      updates.push(event.id);
    }
    for (const slot of slots) writes.push(await upsertEvent({ slot, commitId }));
    return { commitId, writes, deletes, updates };
  };

  const commitRollingWindow = async ({
    startIso,
    endIso,
    items = [],
    onProgress,
  }) => {
    const commitId = `commit_${Date.now().toString(36)}`;
    const notify = (update) => onProgress?.(update);
    const writes = [];
    const deletes = [];
    const failed = [];

    notify({
      phase: "Preparing",
      percent: 5,
      current: "Validating rolling window and schedule payload.",
      deleted: 0,
      added: 0,
      failed: 0,
    });

    notify({
      phase: "Fetching Existing Events",
      percent: 10,
      current: "Loading current Google Calendar events in the next 7 days.",
      deleted: 0,
      added: 0,
      failed: 0,
    });
    const existing = await fetchExistingEvents({ startIso, endIso });

    const deleteTotal = existing.length || 1;
    notify({
      phase: "Deleting Existing Events",
      percent: 15,
      current: `Deleting ${existing.length} events in rolling window.`,
      deleted: 0,
      added: 0,
      failed: 0,
    });
    for (let i = 0; i < existing.length; i += 1) {
      const event = existing[i];
      try {
        await deleteEvent(event.id);
        deletes.push(event.id);
      } catch (error) {
        failed.push({ stage: "delete", id: event.id, error: error.message });
      }
      notify({
        phase: "Deleting Existing Events",
        percent: 15 + Math.round(((i + 1) / deleteTotal) * 35),
        current: `Deleting: ${event.title || event.id}`,
        deleted: deletes.length,
        added: writes.length,
        failed: failed.length,
      });
    }

    const addTotal = items.length || 1;
    notify({
      phase: "Writing Rolling Schedule",
      percent: 55,
      current: `Adding ${items.length} schedule events.`,
      deleted: deletes.length,
      added: writes.length,
      failed: failed.length,
    });
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        writes.push(await insertCommitItem({ item, commitId }));
      } catch (error) {
        failed.push({ stage: "write", title: item.title, error: error.message });
      }
      notify({
        phase: "Writing Rolling Schedule",
        percent: 55 + Math.round(((i + 1) / addTotal) * 40),
        current: `Writing: ${item.title || "Untitled event"}`,
        deleted: deletes.length,
        added: writes.length,
        failed: failed.length,
      });
    }

    notify({
      phase: "Finalizing",
      percent: 100,
      current: "Commit complete.",
      deleted: deletes.length,
      added: writes.length,
      failed: failed.length,
    });

    return {
      commitId,
      writes,
      deletes,
      failed,
      existingCount: existing.length,
      targetCount: items.length,
    };
  };

  const signOut = () => {
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
