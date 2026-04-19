import { createCalendarWriteClient } from "./calendar-write-client.js";
import { applyGoogleConnectButtonState } from "./google-connect-button.js";
import { createPlannerSyncClient } from "./planner-sync-client.js";

export const createPlannerSyncController = ({
  view,
  lastAuthStateRef,
  getWriteClient,
  loadLocalState,
  saveLocalState,
  onRemoteStateApplied,
}) =>
  createPlannerSyncClient({
    onSyncStatus: (message, kind) => {
      if (!lastAuthStateRef.current.error && lastAuthStateRef.current.isSignedIn) view.setStatus(message, kind);
    },
    getAccessToken: (options) => getWriteClient().getAccessToken(options),
    loadLocalState,
    saveLocalState,
    onRemoteStateApplied,
  });

export const createPlannerWriteController = ({
  ui,
  view,
  lastAuthStateRef,
  getAccountKey,
  loadAccountState,
  save,
  syncClient,
  syncImportedGoogleCommitments,
}) =>
  createCalendarWriteClient({
    onStateChange: async (state) => {
      lastAuthStateRef.current = state;
      applyGoogleConnectButtonState(ui.connect, state);
      applyGoogleConnectButtonState(ui.connectDrawer, state);
      ui.commit.disabled = !state.isSignedIn || state.isLoading;
      view.setPlannerLock(!state.isSignedIn);
      if (state.error) view.setStatus(state.error, "error");
      if (!state.error && state.isSignedIn) view.setStatus(`Planner ready for ${state.accountKey || "account"}.`, "success");
      const accountKey = getAccountKey();
      if (state.isSignedIn && state.accountKey && state.accountKey !== accountKey) {
        loadAccountState(state.accountKey);
        save();
        view.setStatus(`Planner loaded for ${getAccountKey()}.`, "success");
        if (syncClient.isEnabled()) await syncClient.bootstrap(getAccountKey());
      }
      if (state.isSignedIn) await syncImportedGoogleCommitments({ silent: true });
    },
  });

export const registerGoogleConnectEvents = ({ ui, view, writeClient, lastAuthStateRef }) => {
  ui.connect.addEventListener("click", async () => {
    if (lastAuthStateRef.current.isSignedIn) {
      view.setStatus("Google Calendar is already connected.", "success");
      return;
    }
    try {
      await writeClient.connect();
      view.setStatus("Google connected. Planner unlocked.", "success");
    } catch (error) {
      writeClient.setError(error.message);
    }
  });
  ui.connectDrawer?.addEventListener("click", () => {
    ui.connect.click();
  });
};
