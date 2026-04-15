const json = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });

const corsHeaders = (request) => {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
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
  if (!token) return null;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (!payload || !payload.sub) return null;
  return {
    userId: String(payload.sub),
    email: String(payload.email || "").toLowerCase(),
  };
};

const fetchProfile = async (db, userId) => {
  const result = await db
    .prepare("SELECT user_id, email, state_json, version, updated_at FROM planner_profiles WHERE user_id = ?1")
    .bind(userId)
    .first();
  if (!result) return null;
  return {
    userId: String(result.user_id),
    email: String(result.email || ""),
    state: JSON.parse(String(result.state_json || "{}")),
    version: Number(result.version || 0),
    updatedAt: String(result.updated_at || ""),
  };
};

const writeProfile = async ({ db, userId, email, state, baseVersion }) => {
  const existing = await fetchProfile(db, userId);
  if (!existing) {
    if (baseVersion !== 0) return { conflict: true, profile: null };
    const version = 1;
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO planner_profiles (user_id, email, state_json, version, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .bind(userId, email, JSON.stringify(state), version, updatedAt)
      .run();
    return { conflict: false, profile: { userId, email, state, version, updatedAt } };
  }
  if (existing.version !== baseVersion) return { conflict: true, profile: existing };
  const nextVersion = existing.version + 1;
  const updatedAt = new Date().toISOString();
  await db
    .prepare("UPDATE planner_profiles SET email = ?1, state_json = ?2, version = ?3, updated_at = ?4 WHERE user_id = ?5")
    .bind(email, JSON.stringify(state), nextVersion, updatedAt, userId)
    .run();
  return { conflict: false, profile: { userId, email, state, version: nextVersion, updatedAt } };
};

const withAuth = async (request, env) => {
  const token = readBearer(request);
  const identity = await verifyGoogleToken(token);
  if (!identity) return { error: json({ error: "Unauthorized" }, 401, corsHeaders(request)) };
  if (!env.PLANNER_DB) return { error: json({ error: "Database binding PLANNER_DB is missing" }, 500, corsHeaders(request)) };
  return { identity, db: env.PLANNER_DB };
};

const parseBody = async (request) => {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
};

const profileResponse = (profile, request) =>
  json(
    { state: profile.state, version: profile.version, updatedAt: profile.updatedAt, email: profile.email },
    200,
    corsHeaders(request),
  );

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === "/api/planner/health" && request.method === "GET") {
      return json({ ok: true, service: "planner-sync-worker" }, 200, corsHeaders(request));
    }
    if (url.pathname !== "/api/planner/profile") return json({ error: "Not found" }, 404, corsHeaders(request));
    const auth = await withAuth(request, env);
    if (auth.error) return auth.error;

    if (request.method === "GET") {
      const profile = await fetchProfile(auth.db, auth.identity.userId);
      if (!profile) return json({ error: "Not found" }, 404, corsHeaders(request));
      return profileResponse(profile, request);
    }

    if (request.method === "PUT") {
      const body = await parseBody(request);
      if (!body || typeof body.state !== "object") return json({ error: "Invalid payload" }, 400, corsHeaders(request));
      const baseVersion = Number(body.baseVersion);
      if (Number.isNaN(baseVersion) || baseVersion < 0) return json({ error: "Invalid baseVersion" }, 400, corsHeaders(request));
      const result = await writeProfile({
        db: auth.db,
        userId: auth.identity.userId,
        email: auth.identity.email,
        state: body.state,
        baseVersion,
      });
      if (result.conflict) {
        return json(
          {
            error: "Version conflict",
            currentVersion: result.profile ? result.profile.version : null,
            updatedAt: result.profile ? result.profile.updatedAt : null,
          },
          409,
          corsHeaders(request),
        );
      }
      return profileResponse(result.profile, request);
    }

    return json({ error: "Method not allowed" }, 405, corsHeaders(request));
  },
};
