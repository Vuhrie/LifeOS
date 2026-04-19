import { canKeepExistingSlot, hasOverlap } from "./planner-policy.js";

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

export const buildUnits = ({ goal, minorGoals, tasks }) => {
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
        priority: Number(goal.importance ?? goal.priority ?? 3),
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
  if (Number.isNaN(deadline.getTime())) return 1;
  const diffDays = Math.max(1, Math.ceil((deadline - slotStart) / 86400000));
  return Math.max(1, 10 - Math.min(9, diffDays - 1));
};

export const scoreCandidate = ({ unit, start, dayPlan, dayRule }) => {
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

export const tryKeepExistingSlots = ({ existingSlots, hardBlocks, lockedUntil, horizonStart, horizonEnd, units }) => {
  const keep = [];
  const consumed = new Set();
  const keptHabitDayKeys = new Set();
  const sorted = [...existingSlots].sort((left, right) => new Date(left.start) - new Date(right.start));
  sorted.forEach((slot) => {
    const isPersistedAiApply = slot.persistedFromAiApply === true;
    const slotStart = new Date(slot.start);
    const slotEnd = new Date(slot.end);
    if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime())) return;
    if (slotStart >= horizonEnd || slotEnd <= horizonStart) return;
    if (!canKeepExistingSlot({ slot, hardBlocks, lockedUntil, horizonStart, horizonEnd })) return;
    const matchingUnit = units.find((unit) => unit.id === slot.id);
    if (!matchingUnit && !(isPersistedAiApply && slot.type !== "habit")) return;
    if (matchingUnit && Number(matchingUnit.durationMinutes || 0) !== Number(slot.durationMinutes || 0)) return;
    if (slot.type === "habit" && !matchingUnit) return;
    if (consumed.has(slot.id)) return;
    const dayKey = slotStart.toDateString();
    const habitKey = habitKeyFromSlot(slot);
    if (habitKey && keptHabitDayKeys.has(`${habitKey}|${dayKey}`)) return;
    if (matchingUnit) consumed.add(slot.id);
    if (habitKey) keptHabitDayKeys.add(`${habitKey}|${dayKey}`);
    keep.push({ ...slot, start: slotStart, end: new Date(slot.end), preserved: true, score: Number(slot.score || 0) });
  });
  return { keep, consumed };
};

export const overlapsAny = (start, end, dayPlan, hardBlocks) =>
  dayPlan.some((existing) => hasOverlap(start, end, existing.start, existing.end))
  || hardBlocks.some((block) => hasOverlap(start, end, block.start, block.end));
