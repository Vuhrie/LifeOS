const CONFIG = window.LIFEOS_PLANNER_SYNC_CONFIG ?? {};
const CONFLICT_BACKUP_PREFIX = "lifeos_sync_conflict_backup_v1_";

const normalizeBaseUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const hasMeaningfulState = (state) =>
  Boolean(
    state
      && state.currentWeekKey
      && state.weeks
      && Object.keys(state.weeks).length,
  );

const sanitizeLegacyHabitArtifacts = (state) => {
  const clone = JSON.parse(JSON.stringify(state || {}));
  const weeks = clone.weeks && typeof clone.weeks === "object" ? clone.weeks : {};
  Object.values(weeks).forEach((week) => {
    if (!week || typeof week !== "object") return;
    const tasks = Array.isArray(week.tasks) ? week.tasks : [];
    const removedIds = new Set(
      tasks
        .filter((item) => String(item?.habitId || ""))
        .map((item) => String(item?.id || ""))
        .filter(Boolean),
    );
    week.tasks = tasks.filter((item) => !String(item?.habitId || ""));
    if (Array.isArray(week.managedSlots)) {
      week.managedSlots = week.managedSlots.filter((slot) => {
        const sourceId = String(slot?.sourceId || "");
        const type = String(slot?.type || "");
        const habitId = String(slot?.habitId || "");
        const persistedFromAiApply = slot?.persistedFromAiApply === true;
        if (persistedFromAiApply) return true;
        return !habitId && type !== "habit" && (!sourceId || !removedIds.has(sourceId));
      });
    }
  });
  clone.weeks = weeks;
  return clone;
};

const stripDraftFromState = (state) => {
  if (!state || typeof state !== "object") {
    return { schemaVersion: 13, currentWeekKey: "", weeks: {}, history: [] };
  }
  const clone = sanitizeLegacyHabitArtifacts(state);
  const weeks = clone.weeks && typeof clone.weeks === "object" ? clone.weeks : {};
  Object.values(weeks).forEach((week) => {
    if (!week || typeof week !== "object") return;
    delete week.draft;
  });
  clone.weeks = weeks;
  clone.schemaVersion = Math.max(13, Number(clone.schemaVersion || 13));
  return clone;
};

const parseSyncEnvelope = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const state = payload.state;
  const version = Number(payload.version);
  if (!state || Number.isNaN(version)) return null;
  return {
    state,
    version,
    updatedAt: String(payload.updatedAt || ""),
    createdAt: String(payload.createdAt || ""),
    lastSeenAt: String(payload.lastSeenAt || ""),
    schemaVersion: Number(payload.schemaVersion || 0),
    serverSchemaVersion: Number(payload.serverSchemaVersion || 0),
    email: String(payload.email || ""),
  };
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

  const saveConflictBackup = (accountKey, local, remote) => {
    try {
      window.localStorage.setItem(
        `${CONFLICT_BACKUP_PREFIX}${accountKey}`,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          accountKey,
          local,
          remote,
        }),
      );
    } catch {}
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
    const parsed = parseSyncEnvelope(await response.json());
    if (!parsed) throw new Error("Sync read returned invalid response.");
    return parsed;
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
    if (!parsed) throw new Error("Sync write returned invalid response.");
    return { conflict: false, ...parsed };
  };

  const pullLatest = async (accountKey) => {
    if (!enabled || !accountKey || accountKey === "anon") return null;
    try {
      const remote = await getProfile();
      if (!remote) return null;
      perAccountVersion.set(accountKey, remote.version);
      const cleanRemoteState = stripDraftFromState(remote.state);
      saveLocalState(cleanRemoteState, accountKey);
      onRemoteStateApplied?.(cleanRemoteState, accountKey, remote.updatedAt);
      emit("Google Connected | Cloud synced", "success");
      return remote;
    } catch (error) {
      emit(`Google Connected | Cloud sync offline (${error.message})`, "warning");
      return null;
    }
  };

  const bootstrap = async (accountKey) => {
    if (!enabled || !accountKey || accountKey === "anon") return;
    emit("Google Connected | Syncing cloud state...", "neutral");
    try {
      const remote = await getProfile();
      const local = stripDraftFromState(loadLocalState(accountKey));
      if (remote) {
        perAccountVersion.set(accountKey, remote.version);
        const cleanRemoteState = stripDraftFromState(remote.state);
        saveLocalState(cleanRemoteState, accountKey);
        onRemoteStateApplied?.(cleanRemoteState, accountKey, remote.updatedAt);
        emit("Google Connected | Cloud synced", "success");
        return;
      }
      const localVersion = hasMeaningfulState(local)
        ? local
        : { schemaVersion: 13, currentWeekKey: "", weeks: {}, history: [] };
      const created = await putProfile(localVersion, 0);
      if (!created.conflict) {
        perAccountVersion.set(accountKey, created.version);
        emit("Google Connected | Cloud profile created", "success");
      }
    } catch (error) {
      emit(`Google Connected | Cloud sync offline (${error.message})`, "warning");
    }
  };

  const pushNow = async (accountKey) => {
    if (!enabled || !accountKey || accountKey === "anon") return;
    const local = stripDraftFromState(loadLocalState(accountKey));
    const baseVersion = perAccountVersion.get(accountKey) || 0;
    try {
      emit("Google Connected | Syncing cloud state...", "neutral");
      const result = await putProfile(local, baseVersion);
      if (result.conflict) {
        const remote = await pullLatest(accountKey);
        saveConflictBackup(accountKey, local, remote?.state || null);
        emit("Google Connected | Conflict detected. Cloud state restored, local backup saved.", "warning");
        return;
      }
      perAccountVersion.set(accountKey, result.version);
      emit("Google Connected | Cloud synced", "success");
    } catch (error) {
      emit(`Google Connected | Cloud sync offline (${error.message})`, "warning");
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
