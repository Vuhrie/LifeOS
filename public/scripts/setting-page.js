import { createCalendarWriteClient } from "./calendar-write-client.js";
import { applyGoogleConnectButtonState } from "./google-connect-button.js";

const connectButton = document.querySelector("#connect-google");
const drawerConnectButton = document.querySelector("#connect-google-drawer");
const signOutButton = document.querySelector("#sign-out");
const accountEmailNode = document.querySelector("#account-email");
const accountStatusNode = document.querySelector("#account-status");
const syncStateNode = document.querySelector("#sync-state");
const syncVersionNode = document.querySelector("#sync-version");
const syncUpdatedNode = document.querySelector("#sync-updated-at");
const syncStatusNode = document.querySelector("#sync-status");
const syncNowButton = document.querySelector("#sync-now");

const syncConfig = window.LIFEOS_PLANNER_SYNC_CONFIG || {};
const syncApiBase = String(syncConfig.apiBaseUrl || "").replace(/\/$/, "");

const parseSyncErrorPayload = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const formatSyncHttpError = (status, payload) => {
  if (status === 401) {
    const hint = String(payload?.hint || "").trim();
    return hint || "Google session is missing required identity permission. Reconnect Google.";
  }
  return `Cloud sync request failed (${status}).`;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const setStatus = (message, kind = "neutral") => {
  if (!accountStatusNode) return;
  accountStatusNode.dataset.kind = kind;
  accountStatusNode.textContent = message;
};

const setSyncStatus = (message, kind = "neutral") => {
  if (!syncStatusNode) return;
  syncStatusNode.dataset.kind = kind;
  syncStatusNode.textContent = message;
};

const setSyncMeta = ({ state = "-", version = "-", updatedAt = "-" } = {}) => {
  if (syncStateNode) syncStateNode.textContent = state;
  if (syncVersionNode) syncVersionNode.textContent = version;
  if (syncUpdatedNode) syncUpdatedNode.textContent = updatedAt;
};

if (connectButton) {
  const writeClient = createCalendarWriteClient({
    onStateChange: async (state) => {
      applyGoogleConnectButtonState(connectButton, state);
      applyGoogleConnectButtonState(drawerConnectButton, state);
      if (signOutButton) signOutButton.disabled = !state.isSignedIn || state.isLoading;
      if (syncNowButton) syncNowButton.disabled = !state.isSignedIn || state.isLoading || !syncApiBase;
      if (accountEmailNode) {
        const label = String(state.accountKey || "").trim().toLowerCase();
        accountEmailNode.textContent = state.isSignedIn && label && label !== "anon"
          ? label
          : state.isSignedIn
            ? "Connected"
            : "Not connected";
      }
      if (!state.isConfigured) {
        setStatus("Google Calendar is not configured.", "warning");
      } else if (state.error) {
        setStatus(state.error, "error");
      } else if (state.isLoading) {
        setStatus("Updating Google session...", "loading");
      } else if (state.isSignedIn) {
        setStatus("Connected. Session will renew silently whenever Google allows it.", "success");
      } else {
        setStatus("Connect Google to continue.", "neutral");
      }
      if (!state.isSignedIn) {
        setSyncMeta({ state: "Not connected", version: "-", updatedAt: "-" });
        setSyncStatus("Connect Google to inspect cloud sync.", "neutral");
      }
    },
  });

  const readCloudProfile = async () => {
    if (!syncApiBase) {
      setSyncMeta({ state: "Unavailable", version: "-", updatedAt: "-" });
      setSyncStatus("Cloud sync API is not configured in this build.", "warning");
      return;
    }
    const current = writeClient.getState();
    if (!current.isSignedIn) {
      setSyncMeta({ state: "Not connected", version: "-", updatedAt: "-" });
      setSyncStatus("Connect Google first.", "warning");
      return;
    }
    setSyncStatus("Checking cloud profile...", "loading");
    try {
      const token = await writeClient.getAccessToken({ interactive: false });
      if (!token) throw new Error("Missing Google token.");
      let response = await fetch(`${syncApiBase}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        setSyncStatus("Cloud auth needs refresh. Reconnecting Google...", "loading");
        const refreshedToken = await writeClient.getAccessToken({ interactive: true, forceRefresh: true });
        response = await fetch(`${syncApiBase}/profile`, {
          headers: { Authorization: `Bearer ${refreshedToken}` },
        });
      }
      if (response.status === 404) {
        setSyncMeta({ state: "No cloud profile", version: "-", updatedAt: "-" });
        setSyncStatus("No profile in D1 yet. It will be created on first planner sync.", "warning");
        return;
      }
      if (!response.ok) {
        const errorPayload = await parseSyncErrorPayload(response);
        throw new Error(formatSyncHttpError(response.status, errorPayload));
      }
      const payload = await response.json();
      setSyncMeta({
        state: "Cloud profile found",
        version: String(payload.version || "-"),
        updatedAt: formatDateTime(payload.updatedAt || ""),
      });
      setSyncStatus("D1 sync is healthy for this Google account.", "success");
    } catch (error) {
      setSyncMeta({ state: "Cloud check failed", version: "-", updatedAt: "-" });
      setSyncStatus(`Cloud sync check failed: ${error.message}`, "error");
    }
  };

  const onConnect = async () => {
    const state = writeClient.getState();
    if (state.isSignedIn) {
      await readCloudProfile();
      return;
    }
    try {
      await writeClient.connect();
      await readCloudProfile();
    } catch (error) {
      writeClient.setError(error.message);
    }
  };

  const onSignOut = () => {
    writeClient.signOut();
    setStatus("Signed out from Google.", "neutral");
    setSyncMeta({ state: "Not connected", version: "-", updatedAt: "-" });
    setSyncStatus("Connect Google to inspect cloud sync.", "neutral");
  };

  connectButton.addEventListener("click", onConnect);
  drawerConnectButton?.addEventListener("click", onConnect);
  signOutButton?.addEventListener("click", onSignOut);
  syncNowButton?.addEventListener("click", async () => {
    await readCloudProfile();
  });
}
