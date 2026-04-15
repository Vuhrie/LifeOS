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
    button.textContent = "Google Connected";
    button.dataset.authState = "connected";
    button.disabled = false;
    return;
  }
  button.textContent = "Connect Google";
  button.dataset.authState = state.error ? "error" : "idle";
  button.disabled = false;
};
