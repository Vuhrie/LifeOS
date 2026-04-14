const TOKEN_STORAGE_KEY = "lifeos_google_calendar_auth_v1";

export const getPersistenceConfig = (config) => {
  const mode = config.authPersistence === "session" ? "session" : "local";
  const durationSeconds = Number.isFinite(Number(config.authDurationSeconds))
    ? Math.max(60, Number(config.authDurationSeconds))
    : 3600;
  const refreshSkewSeconds = Number.isFinite(Number(config.refreshSkewSeconds))
    ? Math.max(0, Number(config.refreshSkewSeconds))
    : 120;
  return { mode, durationSeconds, refreshSkewSeconds };
};

const storageForMode = (mode) => (mode === "session" ? window.sessionStorage : window.localStorage);

export const loadPersistedSession = (mode) => {
  try {
    const raw = storageForMode(mode).getItem(TOKEN_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      Number.isNaN(parsed.expiresAt)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const savePersistedSession = (mode, payload) => {
  storageForMode(mode).setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
};

export const clearPersistedSession = () => {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
};
