import { createCalendarClient } from "./calendar-client.js";
import { renderEvents } from "./calendar-ui.js";

const connectButton = document.querySelector("#connect-google");
const refreshButton = document.querySelector("#refresh-events");
const signOutButton = document.querySelector("#sign-out");
const statusNode = document.querySelector("#calendar-status");
const eventListNode = document.querySelector("#event-list");

const setStatus = (message, kind = "neutral") => {
  statusNode.dataset.kind = kind;
  statusNode.textContent = message;
};

const updateControls = (state) => {
  if (!state.isConfigured) {
    setStatus(
      "Google Calendar is not configured yet. Add your OAuth client ID in scripts/config.js.",
      "warning",
    );
    connectButton.disabled = true;
    refreshButton.disabled = true;
    signOutButton.disabled = true;
    return;
  }

  connectButton.disabled = state.isLoading;
  refreshButton.disabled = !state.isSignedIn || state.isLoading;
  signOutButton.disabled = !state.isSignedIn || state.isLoading;

  if (state.error) {
    setStatus(state.error, "error");
    return;
  }

  if (state.isLoading) {
    setStatus("Loading calendar events...", "loading");
    return;
  }

  if (!state.isSignedIn) {
    setStatus("Connect your Google account to load today's events.", "neutral");
  }
};

const calendar = createCalendarClient({ onStateChange: updateControls });

const loadTodayEvents = async () => {
  try {
    setStatus("Loading calendar events...", "loading");
    const events = await calendar.fetchTodayEvents();
    renderEvents(eventListNode, events, {
      emptyTitle: "No events today",
      emptyBody: "Your calendar is clear for today.",
      groupByDay: false,
    });
    setStatus("Today's schedule is up to date.", "success");
  } catch (error) {
    calendar.setError(error.message);
    renderEvents(eventListNode, [], {
      emptyTitle: "Unable to load events",
      emptyBody: "Try reconnecting and refreshing again.",
      groupByDay: false,
    });
  }
};

connectButton.addEventListener("click", async () => {
  try {
    await calendar.connect();
    await loadTodayEvents();
  } catch (error) {
    calendar.setError(error.message);
  }
});

refreshButton.addEventListener("click", loadTodayEvents);

signOutButton.addEventListener("click", () => {
  calendar.signOut();
  renderEvents(eventListNode, [], {
    emptyTitle: "Signed out",
    emptyBody: "Connect Google again to load your schedule.",
    groupByDay: false,
  });
  setStatus("Signed out from Google Calendar for this session.", "neutral");
});

updateControls(calendar.getState());
