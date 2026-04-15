const TOKEN_STORAGE_KEY = "lifeos_google_calendar_auth_v1";
const LEGACY_WRITE_TOKEN_KEY = "lifeos_google_calendar_write_auth_v1";

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

const parseSession = (raw) => {
  if (!raw) return null;
  try {
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

export const loadPersistedSession = (mode) => {
  try {
    const storage = storageForMode(mode);
    const shared = parseSession(storage.getItem(TOKEN_STORAGE_KEY));
    if (shared) {
      return shared;
    }
    const legacyWrite = parseSession(storage.getItem(LEGACY_WRITE_TOKEN_KEY));
    if (legacyWrite) {
      storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(legacyWrite));
      return legacyWrite;
    }
    return null;
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
  window.localStorage.removeItem(LEGACY_WRITE_TOKEN_KEY);
  window.sessionStorage.removeItem(LEGACY_WRITE_TOKEN_KEY);
};
