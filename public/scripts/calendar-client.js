const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const CONFIG = window.LIFEOS_CALENDAR_CONFIG ?? {};

const parseEvent = (event) => {
  const startValue = event.start?.dateTime ?? event.start?.date;
  const endValue = event.end?.dateTime ?? event.end?.date;
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  return {
    id: event.id,
    title: event.summary?.trim() || "Untitled event",
    description: event.description?.trim() || "",
    location: event.location?.trim() || "",
    start: startValue ? new Date(startValue) : null,
    end: endValue ? new Date(endValue) : null,
    htmlLink: event.htmlLink || "",
    isAllDay,
  };
};

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

export const createCalendarClient = ({ onStateChange }) => {
  const state = {
    isConfigured: typeof CONFIG.googleClientId === "string" && CONFIG.googleClientId.includes(".apps.googleusercontent.com"),
    isSignedIn: false,
    isLoading: false,
    error: "",
  };

  let accessToken = "";
  let tokenClient = null;

  const emit = () => {
    if (typeof onStateChange === "function") {
      onStateChange({ ...state });
    }
  };

  const setLoading = (isLoading) => {
    state.isLoading = isLoading;
    emit();
  };

  const setError = (errorMessage) => {
    state.error = errorMessage;
    emit();
  };

  const ensureTokenClient = async () => {
    if (!state.isConfigured) {
      throw new Error("Google Calendar is not configured yet.");
    }
    if (tokenClient) {
      return tokenClient;
    }

    const loaded = await waitForGoogleIdentity();
    if (!loaded) {
      throw new Error("Google Identity Services failed to load. Refresh and try again.");
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: GOOGLE_SCOPE,
      callback: () => {},
      error_callback: () => {
        setError("Google sign-in failed. Please try again.");
      },
    });

    return tokenClient;
  };

  const requestToken = async (prompt) => {
    const client = await ensureTokenClient();
    setLoading(true);
    setError("");
    return new Promise((resolve, reject) => {
      client.callback = (response) => {
        setLoading(false);
        if (!response || response.error || !response.access_token) {
          state.isSignedIn = false;
          emit();
          reject(new Error(response?.error || "No access token returned by Google."));
          return;
        }

        accessToken = response.access_token;
        state.isSignedIn = true;
        emit();
        resolve(accessToken);
      };

      client.requestAccessToken({ prompt });
    });
  };

  const ensureSignedIn = async () => {
    if (accessToken) {
      return accessToken;
    }
    return requestToken("consent");
  };

  const fetchEvents = async ({ start, end }) => {
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const query = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      maxResults: "250",
    });

    const response = await fetch(`${GOOGLE_API_BASE}/calendars/${calendarId}/events?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        accessToken = "";
        state.isSignedIn = false;
        emit();
      }
      const errorBody = await response.text();
      throw new Error(`Google Calendar API error (${response.status}): ${errorBody}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map(parseEvent).filter((event) => event.start instanceof Date);
  };

  const fetchTodayEvents = async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return fetchEvents({ start, end });
  };

  const fetchUpcomingEvents = async (days = 14) => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return fetchEvents({ start, end });
  };

  const connect = async () => {
    const prompt = accessToken ? "" : "consent";
    return requestToken(prompt);
  };

  const signOut = () => {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = "";
    state.isSignedIn = false;
    emit();
  };

  emit();

  return {
    connect,
    signOut,
    fetchTodayEvents,
    fetchUpcomingEvents,
    getState: () => ({ ...state }),
    setError,
  };
};
