import { getDateForDay, toMinutes } from "./planner-storage.js";

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
        type: "task",
        priority: Number(task.priority || 3),
        mustDo: 0,
        energy: task.energy || "deep",
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

const buildWindows = (weekStart, availabilityRules) =>
  availabilityRules
    .filter((rule) => !rule.hardBlock)
    .map((rule) => {
      const baseDate = getDateForDay(weekStart, Number(rule.day));
      const startMinutes = toMinutes(rule.start);
      const endMinutes = toMinutes(rule.end);
      return {
        day: Number(rule.day),
        date: baseDate,
        startMinutes,
        endMinutes,
        maxMinutes: Math.min(Number(rule.maxHours || 0) * 60, Math.max(0, endMinutes - startMinutes)),
        maxDeepBlocks: Math.max(0, Number(rule.maxDeepBlocks || 0)),
      };
    });

const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;

const scoreCandidate = ({ unit, start, dayPlan, dayRule }) => {
  const urgency = urgencyScore(unit.deadlineIso, start) * 40;
  const priority = Number(unit.priority || 3) * 25;
  const mustDo = Number(unit.mustDo || 0) * 20;
  const energyMatch = unit.energy === "deep" ? (start.getHours() < 18 ? 10 : 4) : 8;
  const contextSwitch = dayPlan.length * 3;
  const latePenalty = start.getHours() >= 21 ? 12 : 0;
  const deepPenalty = unit.energy === "deep" && dayRule.maxDeepBlocks > 0 && dayPlan.filter((slot) => slot.energy === "deep").length >= dayRule.maxDeepBlocks ? 50 : 0;
  return urgency + priority + mustDo + energyMatch - contextSwitch - latePenalty - deepPenalty;
};

export const validatePlannerInput = ({ goal, minorGoals, availabilityRules }) => {
  const errors = [];
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
  if (!minorGoals.length) {
    errors.push("Add at least one schedulable item from goals or habits.");
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

export const generateDraftPlan = ({ goal, minorGoals, tasks, availabilityRules, weekStart }) => {
  const validation = validatePlannerInput({ goal, minorGoals, availabilityRules });
  if (!validation.ok) {
    return { validation, slots: [], unscheduled: [], warnings: [], trace: [] };
  }

  const windows = buildWindows(weekStart, availabilityRules);
  const units = buildUnits({ goal, minorGoals, tasks });
  const dayPlans = new Map();
  const trace = [];
  const slots = [];
  const unscheduled = [];

  windows.forEach((window) => dayPlans.set(window.day, []));

  const sortedUnits = [...units].sort((left, right) => {
    if (right.mustDo !== left.mustDo) return right.mustDo - left.mustDo;
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.id.localeCompare(right.id);
  });

  sortedUnits.forEach((unit) => {
    let best = null;
    windows.forEach((window) => {
      const dayPlan = dayPlans.get(window.day) || [];
      const plannedMinutes = dayPlan.reduce((sum, item) => sum + item.durationMinutes, 0);
      if (plannedMinutes + unit.durationMinutes > window.maxMinutes) {
        return;
      }

      for (let minute = window.startMinutes; minute + unit.durationMinutes <= window.endMinutes; minute += 30) {
        const start = new Date(window.date);
        start.setHours(0, minute, 0, 0);
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + unit.durationMinutes);

        const collides = dayPlan.some((existing) => overlaps(start, end, existing.start, existing.end));
        if (collides) {
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
      energy: unit.energy,
      durationMinutes: unit.durationMinutes,
      start: best.start,
      end: best.end,
      score: best.score,
    };
    dayPlans.get(best.window.day).push(slot);
    slots.push(slot);
    trace.push(`Scheduled ${unit.title} at ${best.start.toLocaleString()} score=${best.score}.`);
  });

  const ordered = slots.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
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
      if (overlaps(slot.start, slot.end, existingStart, existingEnd)) {
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
