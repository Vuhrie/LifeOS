import { createCalendarClient } from "./calendar-client.js";
import { renderEvents } from "./calendar-ui.js";

const connectButton = document.querySelector("#connect-google");
const refreshButton = document.querySelector("#refresh-events");
const signOutButton = document.querySelector("#sign-out");
const rangeSelect = document.querySelector("#range-select");
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
    rangeSelect.disabled = true;
    return;
  }

  connectButton.disabled = state.isLoading;
  refreshButton.disabled = !state.isSignedIn || state.isLoading;
  signOutButton.disabled = !state.isSignedIn || state.isLoading;
  rangeSelect.disabled = !state.isSignedIn || state.isLoading;

  if (state.error) {
    setStatus(state.error, "error");
    return;
  }

  if (state.isLoading) {
    setStatus("Loading upcoming events...", "loading");
    return;
  }

  if (!state.isSignedIn) {
    setStatus("Connect your Google account to load upcoming events.", "neutral");
  }
};

const calendar = createCalendarClient({ onStateChange: updateControls });

const loadUpcomingEvents = async () => {
  try {
    const days = Number(rangeSelect.value);
    setStatus("Loading upcoming events...", "loading");
    const events = await calendar.fetchUpcomingEvents(days);
    renderEvents(eventListNode, events, {
      emptyTitle: "No upcoming events",
      emptyBody: `No events found in the next ${days} days.`,
      groupByDay: true,
    });
    setStatus(`Showing events for the next ${days} days.`, "success");
  } catch (error) {
    calendar.setError(error.message);
    renderEvents(eventListNode, [], {
      emptyTitle: "Unable to load upcoming events",
      emptyBody: "Try reconnecting and refreshing again.",
      groupByDay: true,
    });
  }
};

connectButton.addEventListener("click", async () => {
  try {
    await calendar.connect();
    await loadUpcomingEvents();
  } catch (error) {
    calendar.setError(error.message);
  }
});

refreshButton.addEventListener("click", loadUpcomingEvents);

rangeSelect.addEventListener("change", () => {
  if (calendar.getState().isSignedIn) {
    loadUpcomingEvents();
  }
});

signOutButton.addEventListener("click", () => {
  calendar.signOut();
  renderEvents(eventListNode, [], {
    emptyTitle: "Signed out",
    emptyBody: "Connect Google again to load your upcoming schedule.",
    groupByDay: true,
  });
  setStatus("Signed out from Google Calendar for this session.", "neutral");
});

updateControls(calendar.getState());
