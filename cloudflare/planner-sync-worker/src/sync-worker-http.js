export const SERVER_SCHEMA_VERSION = 1;
export const MAX_STATE_BYTES = 800000;

const parseAllowedOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const readBooleanEnv = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

const resolveAllowedOrigin = (request, env) => {
  const origin = request.headers.get("Origin") || "";
  const allowList = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!allowList.length) return origin || "*";
  if (!origin) return allowList[0];
  if (allowList.includes(origin)) return origin;
  return "";
};

export const corsHeaders = (request, env) => {
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

export const json = (payload, status = 200, headers = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });

const readBearer = (request) => {
  const header = request.headers.get("Authorization") || "";
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return "";
  return parts[1].trim();
};

export const verifyGoogleToken = async (token, env) => {
  if (!token) {
    return {
      ok: false,
      code: "missing_bearer",
      hint: "Missing Google bearer token. Reconnect Google and retry sync.",
    };
  }
  if (token.startsWith("lifeos-test:")) {
    if (!readBooleanEnv(env.ALLOW_TEST_AUTH)) {
      return { ok: false, code: "test_auth_disabled", hint: "Test auth mode is disabled on the sync worker." };
    }
    let account = token.slice("lifeos-test:".length).trim();
    try {
      account = decodeURIComponent(account);
    } catch {}
    const normalized = String(account || "").trim().toLowerCase();
    if (!normalized) {
      return { ok: false, code: "test_auth_invalid", hint: "Test auth token is missing account identity." };
    }
    return { ok: true, userId: `test:${normalized}`, email: normalized };
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
    return { ok: true, userId: String(payload.sub), email: String(payload.email || "").toLowerCase() };
  } catch {
    return {
      ok: false,
      code: "google_userinfo_unreachable",
      hint: "Unable to verify Google token right now. Retry in a moment.",
    };
  }
};

export const withAuth = async (request, env, detectSchemaFlags) => {
  const token = readBearer(request);
  const identity = await verifyGoogleToken(token, env);
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
  if (!env.PLANNER_DB) {
    return { error: json({ error: "Database binding PLANNER_DB is missing" }, 500, corsHeaders(request, env)) };
  }
  const flags = await detectSchemaFlags(env.PLANNER_DB);
  return { identity, db: env.PLANNER_DB, flags };
};

export const parseBody = async (request, maxBytes) => {
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
