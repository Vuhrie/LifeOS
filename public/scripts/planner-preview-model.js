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

export const buildPlannerPreview = ({
  draftSlots = [],
  existingEvents = [],
  horizonStart,
  horizonDays,
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
        kind: "existing",
        badge: "Existing",
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

  const plannedWithConflicts = plannedItems.map((item) => {
    const conflict = existingItems.some((existing) => overlaps(item.start, item.end, existing.start, existing.end));
    return conflict ? { ...item, hasConflict: true, badge: "Conflict" } : item;
  });

  const merged = [...existingItems, ...plannedWithConflicts].sort((left, right) => left.start - right.start);
  const grouped = new Map();
  merged.forEach((item) => {
    const key = dayKey(item.start);
    if (!grouped.has(key)) grouped.set(key, { date: item.start, items: [] });
    grouped.get(key).items.push(item);
  });

  const days = [...grouped.values()]
    .sort((left, right) => left.date - right.date)
    .map((group) => ({ date: group.date, items: group.items.sort((left, right) => left.start - right.start) }));

  return {
    range: { start: previewStart.toISOString(), end: previewEnd.toISOString() },
    days,
    summary: {
      existing: existingItems.length,
      planned: plannedWithConflicts.length,
      conflicts: plannedWithConflicts.filter((item) => item.hasConflict).length,
    },
  };
};
