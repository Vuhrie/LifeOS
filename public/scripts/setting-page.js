import { createCalendarWriteClient } from "./calendar-write-client.js";
import { applyGoogleConnectButtonState } from "./google-connect-button.js";

const connectButton = document.querySelector("#connect-google");
const drawerConnectButton = document.querySelector("#connect-google-drawer");
const signOutButton = document.querySelector("#sign-out");
const accountEmailNode = document.querySelector("#account-email");
const accountStatusNode = document.querySelector("#account-status");

const setStatus = (message, kind = "neutral") => {
  if (!accountStatusNode) return;
  accountStatusNode.dataset.kind = kind;
  accountStatusNode.textContent = message;
};

if (connectButton) {
  const writeClient = createCalendarWriteClient({
    onStateChange: (state) => {
      applyGoogleConnectButtonState(connectButton, state);
      applyGoogleConnectButtonState(drawerConnectButton, state);
      if (signOutButton) signOutButton.disabled = !state.isSignedIn || state.isLoading;
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
    },
  });

  const onConnect = async () => {
    const state = writeClient.getState();
    if (state.isSignedIn) return;
    try {
      await writeClient.connect();
    } catch (error) {
      writeClient.setError(error.message);
    }
  };

  const onSignOut = () => {
    writeClient.signOut();
    setStatus("Signed out from Google.", "neutral");
  };

  connectButton.addEventListener("click", onConnect);
  drawerConnectButton?.addEventListener("click", onConnect);
  signOutButton?.addEventListener("click", onSignOut);
}
