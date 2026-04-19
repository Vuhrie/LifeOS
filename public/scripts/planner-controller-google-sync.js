import {
  isLifeOsManagedCalendarEvent,
  managedCommitWriteIds,
  toHHMM,
  toLocalDate,
  tomorrowStart,
} from "./planner-controller-helpers.js";

export const createGoogleCommitmentSync = ({
  writeClient,
  lastAuthStateRef,
  getWeek,
  save,
  rerenderAll,
  view,
  createCommitment,
}) =>
  async ({
    startIso,
    endIso,
    silent = true,
  } = {}) => {
    if (!lastAuthStateRef.current.isSignedIn) return;
    const week = getWeek();
    let events = [];
    try {
      events = await writeClient.fetchExistingEvents({
        startIso: startIso || tomorrowStart().toISOString(),
        endIso: endIso || new Date(tomorrowStart().getTime() + 14 * 86400000).toISOString(),
      });
    } catch (error) {
      if (!silent) view.setStatus(`Google import failed: ${error.message}`, "error");
      return;
    }
    const lifeOsManagedEventIds = new Set(
      (events || [])
        .filter((event) => isLifeOsManagedCalendarEvent(event))
        .map((event) => String(event.id || ""))
        .filter(Boolean),
    );
    const managedIdsFromCommitLog = managedCommitWriteIds(week);
    managedIdsFromCommitLog.forEach((id) => lifeOsManagedEventIds.add(id));
    let cleanedManagedCommitments = false;
    if (lifeOsManagedEventIds.size) {
      const before = week.profile.commitments.length;
      week.profile.commitments = (week.profile.commitments || []).filter((item) => {
        if (String(item?.source || "") !== "google_imported") return true;
        const eventId = String(item?.googleEventId || "");
        return !eventId || !lifeOsManagedEventIds.has(eventId);
      });
      cleanedManagedCommitments = week.profile.commitments.length !== before;
    }
    const existingIds = new Set(
      (week.profile.commitments || [])
        .map((item) => String(item.googleEventId || ""))
        .filter(Boolean),
    );
    const dismissedIds = new Set(
      (week.dismissedGoogleCommitmentIds || []).map((item) => String(item || "")).filter(Boolean),
    );
    let changedDismissed = false;
    existingIds.forEach((eventId) => {
      if (!dismissedIds.has(eventId)) return;
      dismissedIds.delete(eventId);
      changedDismissed = true;
    });
    const newCommitments = [];
    events.forEach((event) => {
      const eventId = String(event.id || "");
      if (!eventId || existingIds.has(eventId) || dismissedIds.has(eventId) || lifeOsManagedEventIds.has(eventId)) return;
      const start = event.start || "";
      const end = event.end || event.start || "";
      newCommitments.push(createCommitment({
        mode: "one_off",
        title: String(event.title || "Imported commitment"),
        start: toHHMM(start, "09:00"),
        end: toHHMM(end, "10:00"),
        date: toLocalDate(start),
        source: "google_imported",
        googleEventId: eventId,
      }));
    });
    if (changedDismissed) week.dismissedGoogleCommitmentIds = [...dismissedIds];
    if (!newCommitments.length) {
      if (changedDismissed || cleanedManagedCommitments) {
        save();
        rerenderAll();
      }
      if (!silent) view.setStatus("Google commitments already synced.", "neutral");
      return;
    }
    week.profile.commitments = [...week.profile.commitments, ...newCommitments];
    save();
    rerenderAll();
    if (!silent) view.setStatus(`Imported ${newCommitments.length} Google events into commitments.`, "success");
  };
