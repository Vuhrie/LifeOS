import { toMinutes } from "./planner-time.js";
import { buildPlanningWindows, hasOverlap, lockExistingSlots } from "./planner-policy.js";
import {
  buildUnits,
  overlapsAny,
  scoreCandidate,
  tryKeepExistingSlots,
} from "./planner-engine-scheduling.js";

export const validatePlannerInput = ({ goal, minorGoals, availabilityRules }) => {
  const errors = [];
  if (goal && typeof goal === "object") {
    if (!goal.title || !goal.title.trim()) errors.push("Goal title is required.");
    if (!goal.deadlineIso) errors.push("Goal deadline is required.");
    const importance = Number(goal.importance ?? goal.priority);
    if (!(importance >= 1 && importance <= 5)) errors.push("Goal importance must be between 1 and 5.");
  }
  if (!availabilityRules.length) errors.push("Availability rules are required.");
  availabilityRules.forEach((rule) => {
    if (toMinutes(rule.start) >= toMinutes(rule.end)) {
      errors.push(`Availability window is invalid for day ${rule.day}.`);
    }
  });
  return { ok: errors.length === 0, errors };
};

export const generateDraftPlan = ({
  goal,
  minorGoals,
  tasks,
  availabilityRules,
  horizonStart,
  horizonDays = 7,
  profile,
  existingSlots = [],
  lockedHorizonHours = 12,
}) => {
  const validation = validatePlannerInput({ goal, minorGoals, availabilityRules });
  if (!validation.ok) return { validation, slots: [], unscheduled: [], warnings: [], trace: [] };

  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockedHorizonHours * 3600000);
  const horizonEnd = new Date(horizonStart);
  horizonEnd.setDate(horizonStart.getDate() + horizonDays);
  const lockedSlots = lockExistingSlots({ existingSlots, lockedUntil });
  const anchorGoal = goal || {
    title: "General Planning",
    deadlineIso: horizonEnd.toISOString(),
    importance: 3,
    priority: 3,
  };
  const { windows, hardBlocks } = buildPlanningWindows({
    horizonStart,
    horizonDays,
    profile,
    availabilityRules,
    reservedSlots: lockedSlots,
  });
  const units = buildUnits({ goal: anchorGoal, minorGoals, tasks });
  const { keep, consumed } = tryKeepExistingSlots({
    existingSlots,
    hardBlocks,
    lockedUntil,
    horizonStart,
    horizonEnd,
    units,
  });
  const pendingUnits = units.filter((unit) => !consumed.has(unit.id));
  const dayPlans = new Map();
  const habitDayKeys = new Set();
  const trace = [];
  const slots = [...keep];
  const unscheduled = [];

  windows.forEach((window) => dayPlans.set(window.date.toDateString(), []));
  keep.forEach((slot) => {
    const key = new Date(slot.start).toDateString();
    if (!dayPlans.has(key)) dayPlans.set(key, []);
    dayPlans.get(key).push(slot);
    if (slot.type === "habit" && slot.habitId) habitDayKeys.add(`${slot.habitId}|${key}`);
  });

  const sortedUnits = [...pendingUnits].sort((left, right) => {
    if (right.mustDo !== left.mustDo) return right.mustDo - left.mustDo;
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.id.localeCompare(right.id);
  });

  sortedUnits.forEach((unit) => {
    let best = null;
    windows.forEach((window) => {
      const key = window.date.toDateString();
      const dayPlan = dayPlans.get(key) || [];
      const plannedMinutes = dayPlan.reduce((sum, item) => sum + item.durationMinutes, 0);
      if (plannedMinutes + unit.durationMinutes > window.maxMinutes) return;

      const startMinute = window.start.getHours() * 60 + window.start.getMinutes();
      const endMinute = window.end.getHours() * 60 + window.end.getMinutes();
      for (let minute = startMinute; minute + unit.durationMinutes <= endMinute; minute += 30) {
        const start = new Date(window.date);
        start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + unit.durationMinutes);

        if (overlapsAny(start, end, dayPlan, hardBlocks)) continue;
        if (unit.type === "habit" && unit.habitId && habitDayKeys.has(`${unit.habitId}|${key}`)) continue;

        const score = scoreCandidate({ unit, start, dayPlan, dayRule: window });
        const candidate = { window, start, end, score };
        if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.start < best.start)) {
          best = candidate;
        }
      }
    });

    if (!best) {
      unscheduled.push({
        id: unit.id,
        title: unit.title,
        reasonCode: "NO_CAPACITY",
        requiredMinutes: unit.durationMinutes,
      });
      trace.push(`Unscheduled ${unit.title}: NO_CAPACITY.`);
      return;
    }

    const slot = {
      id: unit.id,
      sourceId: unit.sourceId,
      title: unit.title,
      type: unit.type,
      habitId: unit.habitId || "",
      energy: unit.energy,
      durationMinutes: unit.durationMinutes,
      start: best.start,
      end: best.end,
      score: best.score,
      preserved: false,
    };
    const key = best.window.date.toDateString();
    dayPlans.get(key).push(slot);
    if (slot.type === "habit" && slot.habitId) habitDayKeys.add(`${slot.habitId}|${key}`);
    slots.push(slot);
    trace.push(`Scheduled ${unit.title} at ${best.start.toLocaleString()} score=${best.score}.`);
  });

  const ordered = slots.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  const previousById = new Set(existingSlots.map((item) => item.id));
  const nowById = new Set(ordered.map((item) => item.id));
  const removedCount = [...previousById].filter((id) => !nowById.has(id)).length;
  const unchangedCount = ordered.filter((item) => item.preserved).length;
  const addedCount = ordered.length - unchangedCount;
  return {
    validation,
    slots: ordered,
    unscheduled,
    warnings: [],
    trace,
    metrics: {
      scheduledCount: ordered.length,
      unscheduledCount: unscheduled.length,
      totalScheduledMinutes: ordered.reduce((sum, item) => sum + item.durationMinutes, 0),
      unchangedCount,
      addedCount,
      removedCount,
    },
  };
};

export const previewOverlapWarnings = (slots, existingEvents) => {
  const warnings = [];
  slots.forEach((slot) => {
    existingEvents.forEach((event) => {
      if (!event.start || !event.end) return;
      const existingStart = new Date(event.start);
      const existingEnd = new Date(event.end);
      if (hasOverlap(slot.start, slot.end, existingStart, existingEnd)) {
        warnings.push({
          slotId: slot.id,
          slotTitle: slot.title,
          existingTitle: event.title || "Existing event",
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
        });
      }
    });
  });
  return warnings;
};
