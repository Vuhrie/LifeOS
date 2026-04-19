import { MAX_STATE_BYTES, SERVER_SCHEMA_VERSION, corsHeaders, json } from "./sync-worker-http.js";

const schemaFlagsByBinding = new Map();

export const sanitizeState = (state) => {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  if (typeof state.currentWeekKey !== "string") return null;
  if (!state.weeks || typeof state.weeks !== "object" || Array.isArray(state.weeks)) return null;
  const cleanState = JSON.parse(JSON.stringify(state));
  Object.values(cleanState.weeks || {}).forEach((week) => {
    if (!week || typeof week !== "object") return;
    delete week.draft;
  });
  cleanState.schemaVersion = Math.max(12, Number(cleanState.schemaVersion || 12));
  const schemaVersion = Number(cleanState.schemaVersion);
  if (Number.isNaN(schemaVersion) || schemaVersion < 1) return null;
  try {
    const serialized = JSON.stringify(cleanState);
    if (!serialized || serialized.length > MAX_STATE_BYTES) return null;
    return { state: cleanState, serialized, schemaVersion };
  } catch {
    return null;
  }
};

export const detectSchemaFlags = async (db) => {
  const key = String(db || "");
  const cached = schemaFlagsByBinding.get(key);
  if (cached) return cached;
  const rows = await db.prepare("PRAGMA table_info(planner_profiles)").all();
  const columns = (rows?.results || []).map((item) => String(item?.name || "").toLowerCase());
  const flags = {
    hasSchemaVersion: columns.includes("schema_version"),
    hasCreatedAt: columns.includes("created_at"),
    hasLastSeenAt: columns.includes("last_seen_at"),
  };
  schemaFlagsByBinding.set(key, flags);
  return flags;
};

const profileSelectSql = (flags) => {
  const extraColumns = [
    flags.hasSchemaVersion ? "schema_version" : "0 AS schema_version",
    flags.hasCreatedAt ? "created_at" : "updated_at AS created_at",
    flags.hasLastSeenAt ? "last_seen_at" : "updated_at AS last_seen_at",
  ];
  return `SELECT user_id, email, state_json, version, updated_at, ${extraColumns.join(", ")} FROM planner_profiles WHERE user_id = ?1`;
};

export const fetchProfile = async (db, userId, flags) => {
  const result = await db.prepare(profileSelectSql(flags)).bind(userId).first();
  if (!result) return null;
  const state = JSON.parse(String(result.state_json || "{}"));
  return {
    userId: String(result.user_id),
    email: String(result.email || ""),
    state,
    version: Number(result.version || 0),
    schemaVersion: Number(result.schema_version || 0),
    updatedAt: String(result.updated_at || ""),
    createdAt: String(result.created_at || ""),
    lastSeenAt: String(result.last_seen_at || ""),
  };
};

const recordSyncEvent = async (db, userId, action, detail = "") => {
  await db
    .prepare("INSERT INTO planner_sync_events (user_id, action, detail, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(userId, action, detail.slice(0, 500), new Date().toISOString())
    .run();
};

export const touchLastSeen = async (db, userId, flags) => {
  if (!flags.hasLastSeenAt) return;
  await db
    .prepare("UPDATE planner_profiles SET last_seen_at = ?1 WHERE user_id = ?2")
    .bind(new Date().toISOString(), userId)
    .run();
};

export const writeProfile = async ({ db, userId, email, statePayload, baseVersion, flags }) => {
  const existing = await fetchProfile(db, userId, flags);
  if (!existing) {
    if (baseVersion !== 0) return { conflict: true, profile: null };
    const now = new Date().toISOString();
    const columns = ["user_id", "email", "state_json", "version", "updated_at"];
    const values = ["?1", "?2", "?3", "?4", "?5"];
    const binds = [userId, email, statePayload.serialized, 1, now];
    if (flags.hasSchemaVersion) {
      columns.push("schema_version");
      values.push("?6");
      binds.push(statePayload.schemaVersion);
    }
    if (flags.hasCreatedAt) {
      columns.push("created_at");
      values.push(`?${binds.length + 1}`);
      binds.push(now);
    }
    if (flags.hasLastSeenAt) {
      columns.push("last_seen_at");
      values.push(`?${binds.length + 1}`);
      binds.push(now);
    }
    await db.prepare(`INSERT INTO planner_profiles (${columns.join(", ")}) VALUES (${values.join(", ")})`).bind(...binds).run();
    await recordSyncEvent(db, userId, "create_profile", `version=1 schema=${statePayload.schemaVersion}`);
    return {
      conflict: false,
      profile: {
        userId,
        email,
        state: statePayload.state,
        version: 1,
        schemaVersion: statePayload.schemaVersion,
        updatedAt: now,
        createdAt: now,
        lastSeenAt: now,
      },
    };
  }
  if (existing.version !== baseVersion) return { conflict: true, profile: existing };
  const now = new Date().toISOString();
  const updates = ["email = ?1", "state_json = ?2", "version = ?3", "updated_at = ?4"];
  const binds = [email, statePayload.serialized, existing.version + 1, now, userId];
  if (flags.hasSchemaVersion) {
    updates.push(`schema_version = ?${binds.length + 1}`);
    binds.push(statePayload.schemaVersion);
  }
  if (flags.hasLastSeenAt) {
    updates.push(`last_seen_at = ?${binds.length + 1}`);
    binds.push(now);
  }
  await db.prepare(`UPDATE planner_profiles SET ${updates.join(", ")} WHERE user_id = ?5`).bind(...binds).run();
  await recordSyncEvent(db, userId, "update_profile", `version=${existing.version + 1} schema=${statePayload.schemaVersion}`);
  return {
    conflict: false,
    profile: {
      userId,
      email,
      state: statePayload.state,
      version: existing.version + 1,
      schemaVersion: statePayload.schemaVersion,
      updatedAt: now,
      createdAt: existing.createdAt || now,
      lastSeenAt: now,
    },
  };
};

export const profileResponse = (profile, request, env) =>
  json(
    {
      state: profile.state,
      version: profile.version,
      updatedAt: profile.updatedAt,
      createdAt: profile.createdAt,
      lastSeenAt: profile.lastSeenAt,
      schemaVersion: profile.schemaVersion,
      serverSchemaVersion: SERVER_SCHEMA_VERSION,
      email: profile.email,
    },
    200,
    corsHeaders(request, env),
  );
