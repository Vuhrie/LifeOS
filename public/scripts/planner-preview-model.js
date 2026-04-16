const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const inWindow = (start, horizonStart, horizonEnd) => start >= horizonStart && start < horizonEnd;

const readLifeOsSlotId = (description) => {
  const match = String(description || "").match(/lifeos_slot_id:([^\s]+)/i);
  return match ? match[1].trim() : "";
};

const overlaps = (leftStart, leftEnd, rightStart, rightEnd) => leftStart < rightEnd && leftEnd > rightStart;

const toMinutes = (value, fallback) => {
  const [rawHour, rawMinute] = String(value || "").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  return Math.max(0, Math.min(24 * 60, hour * 60 + minute));
};

const atMinute = (date, minute) => {
  const output = new Date(date);
  output.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return output;
};

const dateAtMidnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const inDateRange = (date, startDate, endDate) => {
  if (!startDate || !endDate) return false;
  const day = dateAtMidnight(date).getTime();
  return day >= dateAtMidnight(startDate).getTime() && day <= dateAtMidnight(endDate).getTime();
};

const expandCommitments = ({ commitments = [], horizonStart, horizonDays }) => {
  const items = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = new Date(horizonStart);
    date.setDate(horizonStart.getDate() + offset);
    commitments.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const mode = String(item.mode || "weekly_recurring");
      const days = Array.isArray(item.days) ? item.days.map(Number) : [];
      const oneOffDate = toDate(item.date);
      const startDate = toDate(item.startDate);
      const endDate = toDate(item.endDate);
      let match = false;
      if (mode === "weekly_recurring") match = days.includes(date.getDay());
      if (mode === "date_range_recurring") match = days.includes(date.getDay()) && inDateRange(date, startDate, endDate);
      if (mode === "one_off" && oneOffDate) match = dateAtMidnight(oneOffDate).getTime() === dateAtMidnight(date).getTime();
      if (!match) return;
      const startMinute = toMinutes(item.start, 9 * 60);
      const endMinute = toMinutes(item.end, 18 * 60);
      if (endMinute <= startMinute) return;
      const start = atMinute(date, startMinute);
      const end = atMinute(date, endMinute);
      items.push({
        id: item.id || `commitment_${index}_${start.toISOString()}`,
        start,
        end,
        title: String(item.title || "Commitment"),
        kind: "commitment",
        badge: "Commitment",
      });
    });
  }
  return items;
};

const expandDailyRhythm = ({ profile = {}, horizonStart, horizonDays }) => {
  const wakeMinute = toMinutes(profile.wakeTime, 6 * 60);
  const sleepMinute = toMinutes(profile.sleepTime, 22 * 60);
  const dayEndMinute = sleepMinute > wakeMinute ? sleepMinute : Math.min(24 * 60, wakeMinute + 60);
  const items = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = new Date(horizonStart);
    date.setDate(horizonStart.getDate() + offset);
    const start = atMinute(date, wakeMinute);
    const end = atMinute(date, dayEndMinute);
    if (end <= start) continue;
    items.push({
      id: `daily_rhythm_${date.toISOString().slice(0, 10)}`,
      start,
      end,
      title: "Daily Rhythm",
      kind: "rhythm",
      badge: "Daily Rhythm",
    });
  }
  return items;
};

export const buildPlannerPreview = ({
  draftSlots = [],
  existingEvents = [],
  horizonStart,
  horizonDays,
  commitments = [],
  profile = {},
}) => {
  const previewStart = new Date(horizonStart);
  previewStart.setHours(0, 0, 0, 0);
  const previewEnd = new Date(previewStart);
  previewEnd.setDate(previewStart.getDate() + horizonDays);

  const existingBySlotId = new Map();
  const existingItems = existingEvents
    .map((event) => {
      const start = toDate(event.start);
      const end = toDate(event.end || event.start);
      if (!start || !end || !inWindow(start, previewStart, previewEnd)) return null;
      const linkedSlotId = readLifeOsSlotId(event.description);
      if (linkedSlotId) existingBySlotId.set(linkedSlotId, event.id || linkedSlotId);
      return {
        id: event.id || `existing_${start.toISOString()}`,
        start,
        end,
        title: String(event.title || "Existing event"),
        description: String(event.description || ""),
        kind: "existing",
        badge: "Imported",
        isEditable: true,
      };
    })
    .filter(Boolean);

  const plannedItems = draftSlots
    .map((slot) => {
      const start = toDate(slot.start);
      const end = toDate(slot.end);
      if (!start || !end || !inWindow(start, previewStart, previewEnd)) return null;
      return {
        id: slot.id,
        start,
        end,
        title: String(slot.title || "Planned slot"),
        kind: "planned",
        badge: existingBySlotId.has(slot.id) ? "Planned (Update)" : "Planned",
      };
    })
    .filter(Boolean);

  const commitmentItems = expandCommitments({
    commitments,
    horizonStart: previewStart,
    horizonDays,
  });
  const rhythmItems = expandDailyRhythm({
    profile,
    horizonStart: previewStart,
    horizonDays,
  });

  const plannedWithConflicts = plannedItems.map((item) => {
    const conflict = existingItems.some((existing) => overlaps(item.start, item.end, existing.start, existing.end));
    return conflict ? { ...item, hasConflict: true, badge: "Conflict" } : item;
  });

  const merged = [...rhythmItems, ...existingItems, ...commitmentItems, ...plannedWithConflicts]
    .sort((left, right) => left.start - right.start);
  const grouped = new Map();
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = new Date(previewStart);
    date.setDate(previewStart.getDate() + offset);
    grouped.set(dayKey(date), { date, items: [] });
  }
  merged.forEach((item) => {
    const key = dayKey(item.start);
    if (!grouped.has(key)) return;
    grouped.get(key).items.push(item);
  });

  const days = [...grouped.values()].map((group) => ({
    date: group.date,
    items: group.items.sort((left, right) => left.start - right.start),
  }));

  return {
    range: { start: previewStart.toISOString(), end: previewEnd.toISOString() },
    days,
    summary: {
      rhythm: rhythmItems.length,
      existing: existingItems.length,
      commitments: commitmentItems.length,
      planned: plannedWithConflicts.length,
      conflicts: plannedWithConflicts.filter((item) => item.hasConflict).length,
    },
  };
};
