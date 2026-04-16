import { toMinutes } from "./planner-time.js";
import {
  buildPlanningWindows,
  canKeepExistingSlot,
  hasOverlap,
  lockExistingSlots,
} from "./planner-policy.js";

const chunkTask = (task) => {
  const chunks = [];
  let remaining = Math.max(30, Number(task.estimateMinutes || 60));
  while (remaining > 0) {
    const duration = Math.min(remaining > 120 ? 90 : remaining, 120);
    chunks.push({ ...task, durationMinutes: duration });
    remaining -= duration;
  }
  return chunks;
};

const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes();

const windowScore = (preferredWindow, start) => {
  const minute = minutesOfDay(start);
  if (preferredWindow === "any" || preferredWindow === "anytime" || !preferredWindow) return 0;
  if (preferredWindow === "morning") return minute >= 360 && minute < 720 ? 12 : -8;
  if (preferredWindow === "afternoon") return minute >= 720 && minute < 1020 ? 12 : -8;
  if (preferredWindow === "evening") return minute >= 1020 && minute < 1260 ? 12 : -8;
  if (preferredWindow === "night") return minute >= 1140 || minute < 360 ? 12 : -8;
  return 0;
};

const habitKeyFromSlot = (slot) => {
  if (slot.habitId) return String(slot.habitId);
  const title = String(slot.title || "");
  const match = title.match(/^(.*)\s+Session\s+\d+$/i);
  if (match?.[1]) return match[1].trim().toLowerCase();
  return "";
};

const buildUnits = ({ goal, minorGoals, tasks }) => {
  const units = [];
  minorGoals.forEach((item) => {
    let remaining = Math.max(30, Number(item.targetHours || 1) * 60);
    while (remaining > 0) {
      const duration = Math.min(remaining > 120 ? 90 : remaining, 120);
      units.push({
        id: `${item.id}_${remaining}`,
        sourceId: item.id,
        title: item.title,
        type: "minor_goal",
        priority: goal.priority,
        mustDo: 1,
        energy: "deep",
        deadlineIso: goal.deadlineIso,
        durationMinutes: duration,
      });
      remaining -= duration;
    }
  });

  tasks.forEach((task) => {
    chunkTask(task).forEach((chunk, index) => {
      units.push({
        id: `${task.id}_${index}`,
        sourceId: task.id,
        title: task.title,
        type: task.habitId ? "habit" : "task",
        priority: Number(task.priority || 3),
        mustDo: 0,
        energy: task.energy || "deep",
        habitId: String(task.habitId || ""),
        preferredWindow: String(task.preferredWindow || ""),
        deadlineIso: goal.deadlineIso,
        durationMinutes: chunk.durationMinutes,
      });
    });
  });
  return units;
};

const urgencyScore = (deadlineIso, slotStart) => {
  const deadline = new Date(deadlineIso);
  if (Number.isNaN(deadline.getTime())) {
    return 1;
  }
  const diffDays = Math.max(1, Math.ceil((deadline - slotStart) / 86400000));
  return Math.max(1, 10 - Math.min(9, diffDays - 1));
};

const scoreCandidate = ({ unit, start, dayPlan, dayRule }) => {
  const urgency = urgencyScore(unit.deadlineIso, start) * 40;
  const priority = Number(unit.priority || 3) * 25;
  const mustDo = Number(unit.mustDo || 0) * 20;
  const energyMatch = unit.energy === "deep" ? (start.getHours() < 18 ? 10 : 4) : 8;
  const contextSwitch = dayPlan.length * 3;
  const latePenalty = start.getHours() >= 21 ? 12 : 0;
  const deepPenalty = unit.energy === "deep" && dayRule.maxDeepBlocks > 0 && dayPlan.filter((slot) => slot.energy === "deep").length >= dayRule.maxDeepBlocks ? 50 : 0;
  const preferredWindow = windowScore(unit.preferredWindow, start);
  return urgency + priority + mustDo + energyMatch + preferredWindow - contextSwitch - latePenalty - deepPenalty;
};

export const validatePlannerInput = ({ goal, minorGoals, availabilityRules }) => {
  const errors = [];
  if (goal && typeof goal === "object") {
    if (!goal.title || !goal.title.trim()) {
      errors.push("Goal title is required.");
    }
    if (!goal.deadlineIso) {
      errors.push("Goal deadline is required.");
    }
    if (!(Number(goal.weeklyHours) > 0)) {
      errors.push("Weekly hours must be greater than zero.");
    }
    if (!(Number(goal.priority) >= 1 && Number(goal.priority) <= 5)) {
      errors.push("Goal priority must be between 1 and 5.");
    }
  }
  if (!availabilityRules.length) {
    errors.push("Availability rules are required.");
  }
  availabilityRules.forEach((rule) => {
    if (toMinutes(rule.start) >= toMinutes(rule.end)) {
      errors.push(`Availability window is invalid for day ${rule.day}.`);
    }
  });
  return { ok: errors.length === 0, errors };
};

const tryKeepExistingSlots = ({ existingSlots, hardBlocks, lockedUntil, horizonStart, horizonEnd, units }) => {
  const keep = [];
  const consumed = new Set();
  const keptHabitDayKeys = new Set();
  const sorted = [...existingSlots].sort((left, right) => new Date(left.start) - new Date(right.start));
  sorted.forEach((slot) => {
    if (!canKeepExistingSlot({ slot, hardBlocks, lockedUntil, horizonStart, horizonEnd })) return;
    const isPersistedAiApply = slot.persistedFromAiApply === true;
    const matchingUnit = units.find((unit) => unit.id === slot.id);
    if (!isPersistedAiApply && !matchingUnit) return;
    if (consumed.has(slot.id)) return;
    const slotStart = new Date(slot.start);
    const dayKey = slotStart.toDateString();
    const habitKey = habitKeyFromSlot(slot);
    if (habitKey && keptHabitDayKeys.has(`${habitKey}|${dayKey}`)) return;
    if (matchingUnit) consumed.add(slot.id);
    if (habitKey) keptHabitDayKeys.add(`${habitKey}|${dayKey}`);
    keep.push({
      ...slot,
      start: slotStart,
      end: new Date(slot.end),
      preserved: true,
      score: Number(slot.score || 0),
    });
  });
  return { keep, consumed };
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
  if (!validation.ok) {
    return { validation, slots: [], unscheduled: [], warnings: [], trace: [] };
  }

  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockedHorizonHours * 3600000);
  const horizonEnd = new Date(horizonStart);
  horizonEnd.setDate(horizonStart.getDate() + horizonDays);
  const lockedSlots = lockExistingSlots({ existingSlots, lockedUntil });
  const anchorGoal = goal || {
    title: "General Planning",
    deadlineIso: horizonEnd.toISOString(),
    priority: 3,
    weeklyHours: 0,
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
    if (slot.type === "habit" && slot.habitId) {
      habitDayKeys.add(`${slot.habitId}|${key}`);
    }
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
      if (plannedMinutes + unit.durationMinutes > window.maxMinutes) {
        return;
      }

      const startMinute = window.start.getHours() * 60 + window.start.getMinutes();
      const endMinute = window.end.getHours() * 60 + window.end.getMinutes();
      for (let minute = startMinute; minute + unit.durationMinutes <= endMinute; minute += 30) {
        const start = new Date(window.date);
        start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + unit.durationMinutes);

        const collides = dayPlan.some((existing) => hasOverlap(start, end, existing.start, existing.end))
          || hardBlocks.some((block) => hasOverlap(start, end, block.start, block.end));
        if (collides) {
          continue;
        }
        if (unit.type === "habit" && unit.habitId && habitDayKeys.has(`${unit.habitId}|${key}`)) {
          continue;
        }

        const score = scoreCandidate({ unit, start, dayPlan, dayRule: window });
        const candidate = { window, start, end, score };
        if (!best) {
          best = candidate;
          continue;
        }
        if (candidate.score > best.score) {
          best = candidate;
          continue;
        }
        if (candidate.score === best.score && candidate.start < best.start) {
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
    if (slot.type === "habit" && slot.habitId) {
      habitDayKeys.add(`${slot.habitId}|${key}`);
    }
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
      if (!event.start || !event.end) {
        return;
      }
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
