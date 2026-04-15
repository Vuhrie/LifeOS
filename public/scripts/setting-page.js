import { createCalendarWriteClient } from "./calendar-write-client.js";
import { applyGoogleConnectButtonState } from "./google-connect-button.js";

const connectButton = document.querySelector("#connect-google");
const drawerConnectButton = document.querySelector("#connect-google-drawer");

if (connectButton) {
  const writeClient = createCalendarWriteClient({
    onStateChange: (state) => {
      applyGoogleConnectButtonState(connectButton, state);
      applyGoogleConnectButtonState(drawerConnectButton, state);
    },
  });

  const onConnect = async () => {
    const state = writeClient.getState();
    if (state.isSignedIn) return;
    try {
      await writeClient.connect();
    } catch {}
  };

  connectButton.addEventListener("click", onConnect);
  drawerConnectButton?.addEventListener("click", onConnect);
}
