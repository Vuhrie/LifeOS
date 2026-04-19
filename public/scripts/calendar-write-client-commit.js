const parseCalendarEvent = (event) => ({
  id: event.id,
  title: event.summary || "",
  start: event.start?.dateTime || event.start?.date || "",
  end: event.end?.dateTime || event.end?.date || "",
  description: event.description || "",
  isLifeOsManaged: String(event?.extendedProperties?.private?.lifeosManaged || "").toLowerCase() === "true"
    || String(event.description || "").includes("lifeos_slot_id:")
    || String(event.description || "").includes("lifeos_commit_id:")
    || String(event.summary || "").startsWith("[LifeOS]"),
});

const toIso = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const createCalendarCommitApi = ({
  TEST_MODE,
  CONFIG,
  GOOGLE_API_BASE,
  ensureSignedIn,
  clearSession,
  emit,
}) => {
  const fetchExistingEvents = async ({ startIso, endIso }) => {
    if (TEST_MODE) return [];
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin: startIso, timeMax: endIso, maxResults: "500" });
    const response = await fetch(`${GOOGLE_API_BASE}/calendars/${calendarId}/events?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearSession();
        emit();
      }
      throw new Error(`Failed to fetch existing events (${response.status}).`);
    }
    const payload = await response.json();
    return (payload.items || []).map(parseCalendarEvent);
  };

  const upsertEvent = async ({ slot, commitId }) => {
    if (TEST_MODE) return { id: `test_${commitId}_${slot.id}`, title: `[LifeOS] ${slot.title}`, slotId: slot.id };
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const descriptor = `lifeos_slot_id:${slot.id}`;
    const searchStart = new Date(slot.start);
    searchStart.setDate(searchStart.getDate() - 1);
    const searchEnd = new Date(slot.end);
    searchEnd.setDate(searchEnd.getDate() + 1);
    const existing = await fetchExistingEvents({ startIso: searchStart.toISOString(), endIso: searchEnd.toISOString() });
    const matching = existing.find((event) => (event.description || "").includes(descriptor));
    const payload = {
      summary: `[LifeOS] ${slot.title}`,
      description: `${descriptor}\nlifeos_commit_id:${commitId}`,
      start: { dateTime: slot.start.toISOString() },
      end: { dateTime: slot.end.toISOString() },
    };
    const url = matching
      ? `${GOOGLE_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(matching.id)}`
      : `${GOOGLE_API_BASE}/calendars/${calendarId}/events`;
    const method = matching ? "PATCH" : "POST";
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to ${matching ? "update" : "create"} event (${response.status}).`);
    const data = await response.json();
    return { id: data.id, title: data.summary || payload.summary, slotId: slot.id };
  };

  const deleteEvent = async (eventId) => {
    if (TEST_MODE) return;
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const response = await fetch(
      `${GOOGLE_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to remove event (${response.status}).`);
    }
  };

  const updateEventById = async (event) => {
    if (TEST_MODE) return;
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const payload = {
      summary: String(event.title || "Updated event"),
      description: String(event.description || ""),
      start: { dateTime: new Date(event.start).toISOString() },
      end: { dateTime: new Date(event.end).toISOString() },
    };
    const response = await fetch(
      `${GOOGLE_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(event.id)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) throw new Error(`Failed to update event (${response.status}).`);
  };

  const insertCommitItem = async ({ item, commitId }) => {
    if (TEST_MODE) return { id: `test_${commitId}_${item.sourceId || item.id || item.title}`, title: String(item.title || "LifeOS Event") };
    const token = await ensureSignedIn();
    const calendarId = encodeURIComponent(CONFIG.calendarId || "primary");
    const sourceId = String(item.sourceId || item.id || "");
    const itemType = String(item.type || "planned");
    const markerDescription = [
      String(item.description || "").trim(),
      "lifeos_managed:true",
      `lifeos_commit_id:${String(commitId)}`,
      `lifeos_source_id:${sourceId}`,
      `lifeos_item_type:${itemType}`,
    ].filter(Boolean).join("\n");
    const payload = {
      summary: String(item.title || "LifeOS Event"),
      description: markerDescription,
      start: { dateTime: toIso(item.start) },
      end: { dateTime: toIso(item.end) },
      extendedProperties: {
        private: {
          lifeosManaged: "true",
          lifeosCommitId: String(commitId),
          lifeosSourceId: sourceId,
          lifeosType: itemType,
        },
      },
    };
    const response = await fetch(`${GOOGLE_API_BASE}/calendars/${calendarId}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to create event (${response.status}).`);
    const data = await response.json();
    return { id: data.id, title: data.summary || payload.summary };
  };

  const commitDraft = async (slots, { deleteEventIds = [], updateEvents = [] } = {}) => {
    const commitId = `commit_${Date.now().toString(36)}`;
    const writes = [];
    const deletes = [];
    const updates = [];
    for (const eventId of deleteEventIds) {
      await deleteEvent(eventId);
      deletes.push(eventId);
    }
    for (const event of updateEvents) {
      await updateEventById(event);
      updates.push(event.id);
    }
    for (const slot of slots) writes.push(await upsertEvent({ slot, commitId }));
    return { commitId, writes, deletes, updates };
  };

  const commitRollingWindow = async ({ startIso, endIso, items = [], onProgress }) => {
    const commitId = `commit_${Date.now().toString(36)}`;
    const notify = (update) => onProgress?.(update);
    const writes = [];
    const deletes = [];
    const failed = [];

    notify({ phase: "Preparing", percent: 5, current: "Validating rolling window and schedule payload.", deleted: 0, added: 0, failed: 0 });
    notify({ phase: "Fetching Existing Events", percent: 10, current: "Loading current Google Calendar events in the next 7 days.", deleted: 0, added: 0, failed: 0 });
    const existing = await fetchExistingEvents({ startIso, endIso });

    const deleteTotal = existing.length || 1;
    notify({ phase: "Deleting Existing Events", percent: 15, current: `Deleting ${existing.length} events in rolling window.`, deleted: 0, added: 0, failed: 0 });
    for (let i = 0; i < existing.length; i += 1) {
      const event = existing[i];
      try {
        await deleteEvent(event.id);
        deletes.push(event.id);
      } catch (error) {
        failed.push({ stage: "delete", id: event.id, error: error.message });
      }
      notify({
        phase: "Deleting Existing Events",
        percent: 15 + Math.round(((i + 1) / deleteTotal) * 35),
        current: `Deleting: ${event.title || event.id}`,
        deleted: deletes.length,
        added: writes.length,
        failed: failed.length,
      });
    }

    const addTotal = items.length || 1;
    notify({ phase: "Writing Rolling Schedule", percent: 55, current: `Adding ${items.length} schedule events.`, deleted: deletes.length, added: writes.length, failed: failed.length });
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        writes.push(await insertCommitItem({ item, commitId }));
      } catch (error) {
        failed.push({ stage: "write", title: item.title, error: error.message });
      }
      notify({
        phase: "Writing Rolling Schedule",
        percent: 55 + Math.round(((i + 1) / addTotal) * 40),
        current: `Writing: ${item.title || "Untitled event"}`,
        deleted: deletes.length,
        added: writes.length,
        failed: failed.length,
      });
    }

    notify({ phase: "Finalizing", percent: 100, current: "Commit complete.", deleted: deletes.length, added: writes.length, failed: failed.length });
    return { commitId, writes, deletes, failed, existingCount: existing.length, targetCount: items.length };
  };

  return {
    fetchExistingEvents,
    commitDraft,
    commitRollingWindow,
  };
};
