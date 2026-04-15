const CONFIG = window.LIFEOS_PLANNER_SYNC_CONFIG ?? {};

const normalizeBaseUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const hasMeaningfulState = (state) =>
  Boolean(
    state &&
      state.currentWeekKey &&
      state.weeks &&
      Object.keys(state.weeks).length,
  );

const parseSyncEnvelope = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const state = payload.state;
  const version = Number(payload.version);
  if (!state || Number.isNaN(version)) return null;
  return { state, version, updatedAt: String(payload.updatedAt || "") };
};

export const createPlannerSyncClient = ({
  onSyncStatus,
  getAccessToken,
  loadLocalState,
  saveLocalState,
  onRemoteStateApplied,
}) => {
  const apiBaseUrl = normalizeBaseUrl(CONFIG.apiBaseUrl || "/api/planner");
  const enabled = Boolean(apiBaseUrl);
  const perAccountVersion = new Map();
  const pushTimers = new Map();

  const emit = (message, kind = "neutral") => {
    onSyncStatus?.(message, kind);
  };

  const authHeaders = async () => {
    const token = await getAccessToken?.({ interactive: false });
    if (!token) throw new Error("Missing Google token for cloud sync.");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const getProfile = async () => {
    const response = await fetch(`${apiBaseUrl}/profile`, { headers: await authHeaders() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Sync read failed (${response.status}).`);
    return parseSyncEnvelope(await response.json());
  };

  const putProfile = async (state, baseVersion) => {
    const response = await fetch(`${apiBaseUrl}/profile`, {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify({ state, baseVersion }),
    });
    if (response.status === 409) return { conflict: true };
    if (!response.ok) throw new Error(`Sync write failed (${response.status}).`);
    const parsed = parseSyncEnvelope(await response.json());
    return { conflict: false, ...parsed };
  };

  const pullLatest = async (accountKey) => {
    if (!enabled || !accountKey || accountKey === "anon") return null;
    try {
      const remote = await getProfile();
      if (!remote) return null;
      perAccountVersion.set(accountKey, remote.version);
      saveLocalState(remote.state, accountKey);
      onRemoteStateApplied?.(remote.state, accountKey, remote.updatedAt);
      emit("Google Connected • Synced", "success");
      return remote;
    } catch (error) {
      emit(`Google Connected • Sync offline (${error.message})`, "warning");
      return null;
    }
  };

  const bootstrap = async (accountKey) => {
    if (!enabled || !accountKey || accountKey === "anon") return;
    emit("Google Connected • Syncing...", "neutral");
    try {
      const remote = await getProfile();
      const local = loadLocalState(accountKey);
      if (remote) {
        perAccountVersion.set(accountKey, remote.version);
        saveLocalState(remote.state, accountKey);
        onRemoteStateApplied?.(remote.state, accountKey, remote.updatedAt);
        emit("Google Connected • Synced", "success");
        return;
      }
      const localVersion = hasMeaningfulState(local) ? local : { schemaVersion: 8, currentWeekKey: "", weeks: {}, history: [] };
      const created = await putProfile(localVersion, 0);
      if (!created.conflict) {
        perAccountVersion.set(accountKey, created.version);
        emit("Google Connected • Synced", "success");
      }
    } catch (error) {
      emit(`Google Connected • Sync offline (${error.message})`, "warning");
    }
  };

  const pushNow = async (accountKey) => {
    if (!enabled || !accountKey || accountKey === "anon") return;
    const local = loadLocalState(accountKey);
    const baseVersion = perAccountVersion.get(accountKey) || 0;
    try {
      emit("Google Connected • Syncing...", "neutral");
      const result = await putProfile(local, baseVersion);
      if (result.conflict) {
        emit("Google Connected • Conflict detected, refreshing cloud state.", "warning");
        await pullLatest(accountKey);
        return;
      }
      perAccountVersion.set(accountKey, result.version);
      emit("Google Connected • Synced", "success");
    } catch (error) {
      emit(`Google Connected • Sync offline (${error.message})`, "warning");
    }
  };

  const queuePush = (accountKey, delayMs = 900) => {
    if (!enabled || !accountKey || accountKey === "anon") return;
    const existing = pushTimers.get(accountKey);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      pushTimers.delete(accountKey);
      pushNow(accountKey);
    }, delayMs);
    pushTimers.set(accountKey, timer);
  };

  return {
    isEnabled: () => enabled,
    bootstrap,
    queuePush,
    pullLatest,
  };
};
