import {
  MAX_STATE_BYTES,
  SERVER_SCHEMA_VERSION,
  corsHeaders,
  json,
  parseBody,
  withAuth,
} from "./sync-worker-http.js";
import {
  detectSchemaFlags,
  fetchProfile,
  profileResponse,
  sanitizeState,
  touchLastSeen,
  writeProfile,
} from "./sync-worker-db.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
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
    if (url.pathname !== "/api/planner/profile") {
      return json({ error: "Not found" }, 404, corsHeaders(request, env));
    }

    const auth = await withAuth(request, env, detectSchemaFlags);
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
      if (Number.isNaN(baseVersion) || baseVersion < 0) {
        return json({ error: "Invalid baseVersion" }, 400, corsHeaders(request, env));
      }
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
