export const applyGoogleConnectButtonState = (button, state) => {
  if (!button) return;
  button.classList.add("google-connect-button");
  if (!state.isConfigured) {
    button.textContent = "Google Not Configured";
    button.dataset.authState = "disabled";
    button.disabled = true;
    return;
  }
  if (state.isLoading) {
    button.textContent = "Connecting...";
    button.dataset.authState = "loading";
    button.disabled = true;
    return;
  }
  if (state.isSignedIn) {
    const accountLabel = String(state.accountKey || "").trim().toLowerCase();
    button.textContent = accountLabel && accountLabel !== "anon" ? accountLabel : "Google Connected";
    button.dataset.authState = "connected";
    button.title = button.textContent;
    button.setAttribute("aria-label", `Google account: ${button.textContent}`);
    button.disabled = false;
    return;
  }
  button.textContent = "Connect Google";
  button.dataset.authState = state.error ? "error" : "idle";
  button.title = "";
  button.setAttribute("aria-label", "Connect Google");
  button.disabled = false;
};
