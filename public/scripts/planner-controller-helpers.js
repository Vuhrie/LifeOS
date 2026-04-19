export const dateOnly = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export const hmOf = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "09:00";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
};

export const withHm = (dateLike, hhmm) => {
  const [rawHour, rawMinute] = String(hhmm || "").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  date.setHours(hour, minute, 0, 0);
  return date;
};

export const toLocalDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toHHMM = (value, fallback = "09:00") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
};

export const tomorrowStart = () => {
  const next = new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
};

const isoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const mondayStartKey = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return isoDate(copy);
};

export const buildDeterministicHabitTasks = ({ habits, horizonStart, horizonDays }) => {
  const rollingDays = Array.from({ length: horizonDays }).map((_, index) => {
    const date = new Date(horizonStart);
    date.setDate(horizonStart.getDate() + index);
    return { date, weekKey: mondayStartKey(date) };
  });
  const daysPerWeek = new Map();
  rollingDays.forEach((day) => {
    daysPerWeek.set(day.weekKey, (daysPerWeek.get(day.weekKey) || 0) + 1);
  });

  const tasks = [];
  (habits || []).forEach((habit) => {
    const frequency = Math.max(0, Number(habit.frequency || 0));
    const duration = Math.max(15, Number(habit.durationMinutes || 60));
    if (!frequency) return;
    const maxByWeek = new Map();
    [...daysPerWeek.entries()].forEach(([weekKey, daysInWeekPortion]) => {
      const partialCap = Math.ceil((frequency * daysInWeekPortion) / 7);
      maxByWeek.set(weekKey, Math.min(frequency, Math.max(0, partialCap)));
    });
    const placedByWeek = new Map();
    rollingDays.forEach((day, dayIndex) => {
      const placed = placedByWeek.get(day.weekKey) || 0;
      const cap = maxByWeek.get(day.weekKey) || 0;
      if (placed >= cap) return;
      tasks.push({
        id: `${habit.id}_${day.weekKey}_${placed + 1}_${dayIndex}`,
        title: `${habit.name} Session ${placed + 1}`,
        estimateMinutes: duration,
        priority: 3,
        energy: "deep",
        habitId: String(habit.id || ""),
        preferredWindow: String(habit.window || "anytime"),
        status: "active",
        source: "deterministic_habit",
      });
      placedByWeek.set(day.weekKey, placed + 1);
    });
  });

  return tasks;
};

const filterIgnoredEvents = (events, ignoredIds) =>
  (events || []).filter((event) => !ignoredIds.includes(String(event.id || "")));

const hiddenGoogleEventIds = (week) =>
  new Set([
    ...(Array.isArray(week?.ignoredGoogleEventIds) ? week.ignoredGoogleEventIds : []),
    ...(Array.isArray(week?.dismissedGoogleCommitmentIds) ? week.dismissedGoogleCommitmentIds : []),
  ].map((item) => String(item || "")).filter(Boolean));

export const filterHiddenGoogleEvents = (events, week) => {
  const hiddenIds = hiddenGoogleEventIds(week);
  return filterIgnoredEvents(events, [...hiddenIds]);
};

export const applyImportedEventEdits = (events, edits) =>
  (events || []).map((event) => {
    const patch = edits?.[String(event.id || "")];
    return patch ? { ...event, ...patch } : event;
  });

export const isLifeOsManagedCalendarEvent = (event) =>
  Boolean(event?.isLifeOsManaged)
  || String(event?.description || "").includes("lifeos_slot_id:")
  || String(event?.description || "").includes("lifeos_commit_id:")
  || String(event?.title || "").startsWith("[LifeOS]");

export const managedCommitWriteIds = (week) =>
  new Set(
    (week?.commitLog || [])
      .flatMap((entry) => Array.isArray(entry?.writes) ? entry.writes : [])
      .map((item) => String(item?.id || ""))
      .filter(Boolean),
  );

export const formatDateLabel = (value) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));

export const collectCommitItemsFromDraft = (draft) => {
  const items = [];
  const days = draft?.preview?.days || [];
  days.forEach((day) => {
    (day.items || []).forEach((item, index) => {
      const kind = String(item.kind || "");
      if (kind !== "planned" && kind !== "commitment") return;
      if (String(item.title || "").trim().toLowerCase() === "daily rhythm") return;
      const start = new Date(item.start);
      const end = new Date(item.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;
      items.push({
        id: String(item.id || `${start.toISOString()}_${index}`),
        sourceId: String(item.sourceId || item.id || ""),
        title: String(item.title || "LifeOS Event"),
        type: kind === "commitment" ? "commitment" : "planned",
        start,
        end,
      });
    });
  });
  items.sort((left, right) => left.start - right.start || left.title.localeCompare(right.title));
  return items;
};

export const inHorizonWindow = (dateValue, horizonStart, horizonEnd) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date >= horizonStart && date < horizonEnd;
};

export const buildDraftFromSlots = ({ slots, horizonStart, horizonDays }) => {
  const start = new Date(horizonStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + horizonDays);
  const filtered = (Array.isArray(slots) ? slots : [])
    .map((slot) => {
      const slotStart = new Date(slot.start);
      const slotEnd = new Date(slot.end);
      if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime()) || slotEnd <= slotStart) return null;
      if (!inHorizonWindow(slotStart, start, end)) return null;
      return { ...slot, start: slotStart, end: slotEnd };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || String(left.id || "").localeCompare(String(right.id || "")));
  return {
    validation: { ok: true, errors: [] },
    slots: filtered,
    unscheduled: [],
    warnings: [],
    trace: [],
    metrics: {
      scheduledCount: filtered.length,
      unscheduledCount: 0,
      totalScheduledMinutes: filtered.reduce((sum, item) => sum + Math.max(0, Number(item.durationMinutes || 0)), 0),
      unchangedCount: filtered.length,
      addedCount: 0,
      removedCount: 0,
    },
  };
};

export const rebuildSessionDraftPreview = ({
  sessionDraft,
  week,
  buildPlannerPreview,
  previewOverlapWarnings,
  filterHiddenGoogleEvents,
  applyImportedEventEdits,
}) => {
  const horizonStart = new Date(sessionDraft.horizonStartIso || Date.now());
  horizonStart.setHours(0, 0, 0, 0);
  const horizonDays = Number(sessionDraft.horizonDays || week.settings.horizonDays || 7);
  const visibleImported = filterHiddenGoogleEvents(sessionDraft.importedEvents || [], week);
  const editedImported = applyImportedEventEdits(visibleImported, week.importedEventEdits);
  const preview = buildPlannerPreview({
    draftSlots: sessionDraft.slots || [],
    existingEvents: editedImported,
    horizonStart,
    horizonDays,
    commitments: week.profile.commitments,
    profile: week.profile,
  });
  const warnings = previewOverlapWarnings(sessionDraft.slots || [], editedImported);
  return { editedImported, preview, warnings };
};
