const MAX_STATE_BYTES = 800000;
const SERVER_SCHEMA_VERSION = 1;
const schemaFlagsByBinding = new Map();

const json = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });

const parseAllowedOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const resolveAllowedOrigin = (request, env) => {
  const origin = request.headers.get("Origin") || "";
  const allowList = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!allowList.length) return origin || "*";
  if (!origin) return allowList[0];
  if (allowList.includes(origin)) return origin;
  return "";
};

const corsHeaders = (request, env) => {
  const allowedOrigin = resolveAllowedOrigin(request, env);
  if (!allowedOrigin) {
    return {
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

const readBearer = (request) => {
  const header = request.headers.get("Authorization") || "";
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return "";
  return parts[1].trim();
};

const verifyGoogleToken = async (token) => {
  if (!token) {
    return {
      ok: false,
      code: "missing_bearer",
      hint: "Missing Google bearer token. Reconnect Google and retry sync.",
    };
  }
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return {
        ok: false,
        code: "google_userinfo_rejected",
        providerStatus: response.status,
        hint: "Google token is expired or missing identity scope. Reconnect Google and retry sync.",
      };
    }
    const payload = await response.json();
    if (!payload || !payload.sub) {
      return {
        ok: false,
        code: "google_userinfo_invalid",
        hint: "Google token did not include account identity. Reconnect Google and retry sync.",
      };
    }
    return {
      ok: true,
      userId: String(payload.sub),
      email: String(payload.email || "").toLowerCase(),
    };
  } catch {
    return {
      ok: false,
      code: "google_userinfo_unreachable",
      hint: "Unable to verify Google token right now. Retry in a moment.",
    };
  }
};

const sanitizeState = (state) => {
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

const detectSchemaFlags = async (db) => {
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

const fetchProfile = async (db, userId, flags) => {
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

const touchLastSeen = async (db, userId, flags) => {
  if (!flags.hasLastSeenAt) return;
  await db
    .prepare("UPDATE planner_profiles SET last_seen_at = ?1 WHERE user_id = ?2")
    .bind(new Date().toISOString(), userId)
    .run();
};

const writeProfile = async ({ db, userId, email, statePayload, baseVersion, flags }) => {
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
    await db
      .prepare(`INSERT INTO planner_profiles (${columns.join(", ")}) VALUES (${values.join(", ")})`)
      .bind(...binds)
      .run();
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
  await db
    .prepare(`UPDATE planner_profiles SET ${updates.join(", ")} WHERE user_id = ?5`)
    .bind(...binds)
    .run();
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

const withAuth = async (request, env) => {
  const token = readBearer(request);
  const identity = await verifyGoogleToken(token);
  if (!identity.ok) {
    return {
      error: json(
        {
          error: "Unauthorized",
          code: identity.code,
          hint: identity.hint,
          providerStatus: identity.providerStatus || null,
        },
        401,
        corsHeaders(request, env),
      ),
    };
  }
  if (!env.PLANNER_DB) return { error: json({ error: "Database binding PLANNER_DB is missing" }, 500, corsHeaders(request, env)) };
  const flags = await detectSchemaFlags(env.PLANNER_DB);
  return { identity, db: env.PLANNER_DB, flags };
};

const parseBody = async (request, maxBytes) => {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) return null;
  try {
    const raw = await request.text();
    if (!raw || raw.length > maxBytes) return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
};

const profileResponse = (profile, request, env) =>
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (url.pathname === "/api/planner/health" && request.method === "GET") {
      return json(
        {
          ok: true,
          service: "planner-sync-worker",
          serverSchemaVersion: SERVER_SCHEMA_VERSION,
        },
        200,
        corsHeaders(request, env),
      );
    }
    if (url.pathname !== "/api/planner/profile") return json({ error: "Not found" }, 404, corsHeaders(request, env));
    const auth = await withAuth(request, env);
    if (auth.error) return auth.error;

    if (request.method === "GET") {
      const profile = await fetchProfile(auth.db, auth.identity.userId, auth.flags);
      if (!profile) return json({ error: "Not found" }, 404, corsHeaders(request, env));
      await touchLastSeen(auth.db, auth.identity.userId, auth.flags);
      return profileResponse(profile, request, env);
    }

    if (request.method === "PUT") {
      const body = await parseBody(request, MAX_STATE_BYTES + 6000);
      if (!body) return json({ error: "Invalid or oversized payload" }, 400, corsHeaders(request, env));
      const statePayload = sanitizeState(body.state);
      if (!statePayload) return json({ error: "Invalid planner state" }, 400, corsHeaders(request, env));
      const baseVersion = Number(body.baseVersion);
      if (Number.isNaN(baseVersion) || baseVersion < 0) return json({ error: "Invalid baseVersion" }, 400, corsHeaders(request, env));
      const result = await writeProfile({
        db: auth.db,
        userId: auth.identity.userId,
        email: auth.identity.email,
        statePayload,
        baseVersion,
        flags: auth.flags,
      });
      if (result.conflict) {
        return json(
          {
            error: "Version conflict",
            currentVersion: result.profile ? result.profile.version : null,
            updatedAt: result.profile ? result.profile.updatedAt : null,
            serverSchemaVersion: SERVER_SCHEMA_VERSION,
          },
          409,
          corsHeaders(request, env),
        );
      }
      return profileResponse(result.profile, request, env);
    }

    return json({ error: "Method not allowed" }, 405, corsHeaders(request, env));
  },
};
