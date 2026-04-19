import { validateAiRollingPlan } from "./ai-bridge-validator.js";
import {
  createCommitment,
  createGoal,
  createHabit,
  createMinorGoal,
  createTask,
} from "./planner-storage.js";

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateFromDayTime = (dateText, timeText) => new Date(`${dateText}T${timeText}:00`);

const titleKey = (value) => String(value || "").trim().toLowerCase();

const resolveMajorGoal = (minorGoal, goals) => {
  if (minorGoal.majorGoalId) return minorGoal.majorGoalId;
  const match = (goals || []).find((item) => String(item.title || "").toLowerCase() === String(minorGoal.majorGoalTitle || "").toLowerCase());
  return match?.id || "";
};

const resolveMinorGoalId = (task, minorGoals) => {
  if (task.minorGoalId) return task.minorGoalId;
  const match = (minorGoals || []).find((item) => String(item.title || "").toLowerCase() === String(task.minorGoalTitle || "").toLowerCase());
  return match?.id || "";
};

const buildAiDraftFromRollingPlan = (plan, profile) => {
  const rhythmStart = profile?.wakeTime || "06:00";
  const rhythmEnd = profile?.sleepTime || "22:00";
  const slots = [];
  const days = (plan.rollingPlan || []).map((day) => ({
    date: new Date(`${day.date}T00:00:00`),
    items: [
      {
        id: `${day.date}_rhythm`,
        start: toDateFromDayTime(day.date, rhythmStart),
        end: toDateFromDayTime(day.date, rhythmEnd),
        title: "Daily Rhythm",
        rawType: "daily_rhythm",
        sourceId: "",
        kind: "rhythm",
        badge: "Daily Rhythm",
      },
      ...(day.items || []).map((item, index) => ({
        id: `${day.date}_${index}_${item.type}`,
        start: toDateFromDayTime(day.date, item.start),
        end: toDateFromDayTime(day.date, item.end),
        title: item.title,
        rawType: item.type,
        sourceId: item.sourceId || "",
        kind: item.type === "commitment" ? "commitment" : "planned",
        badge: item.type === "commitment"
          ? "Commitment"
          : item.type === "habit"
            ? "Habit"
            : item.type === "necessity"
              ? "Necessity"
              : item.type === "rest"
                ? "Rest"
                : item.type === "free_time"
                  ? "Free Time"
                  : "Planned",
      })),
    ],
  }));
  days.forEach((day) => {
    day.items.forEach((item) => {
      if (item.kind === "commitment" || item.rawType === "daily_rhythm") return;
      const normalizedType = item.rawType === "habit"
        ? "habit"
        : item.rawType === "rest"
          ? "rest"
          : item.rawType === "free_time"
            ? "free_time"
            : "task";
      slots.push({
        id: item.id,
        sourceId: item.sourceId || item.id,
        title: item.title,
        type: normalizedType,
        energy: normalizedType === "rest" || normalizedType === "free_time" ? "light" : "deep",
        durationMinutes: Math.max(15, Math.round((item.end - item.start) / 60000)),
        start: item.start,
        end: item.end,
        score: 0,
        preserved: false,
        persistedFromAiApply: true,
      });
    });
  });
  const startDate = days[0]?.date ? toIsoDate(days[0].date) : "";
  const endDate = days[days.length - 1]?.date ? toIsoDate(days[days.length - 1].date) : "";
  return {
    validation: { ok: true, errors: [] },
    slots,
    unscheduled: [],
    warnings: (plan.warnings || []).map((text) => ({ slotTitle: "AI warning", existingTitle: text })),
    preview: {
      range: { start: `${startDate}T00:00:00`, end: `${endDate}T23:59:00` },
      days,
      summary: {
        existing: 0,
        commitments: days.reduce((sum, day) => sum + day.items.filter((item) => item.kind === "commitment").length, 0),
        planned: days.reduce((sum, day) => sum + day.items.filter((item) => item.kind === "planned").length, 0),
        conflicts: 0,
      },
    },
  };
};

const applyLegacyOperations = ({ plan, week, weekKey }) => {
  (plan.operations || []).forEach((operation) => {
    if (operation.op === "setProfile") {
      const value = operation.value || {};
      if (value.wakeTime) week.profile.wakeTime = value.wakeTime;
      if (value.sleepTime) week.profile.sleepTime = value.sleepTime;
      if (value.necessities) week.profile.necessities = { ...week.profile.necessities, ...value.necessities };
    }
    if (operation.op === "setHorizon") week.settings = { ...week.settings, ...operation.value };
    if (operation.op === "replaceGoals") {
      week.goals = operation.items.map((item) =>
        createGoal({
          title: item.title,
          deadlineIso: item.deadline ? `${item.deadline}T23:59:59` : "",
          importance: item.importance ?? item.priority,
        }));
    }
    if (operation.op === "replaceHabits") week.habits = operation.items.map((item) => createHabit(item));
    if (operation.op === "replaceCommitments") week.profile.commitments = operation.items.map((item) => createCommitment(item));
    if (operation.op === "replaceTasks") week.tasks = operation.items.map((item) => createTask({ weekKey, ...item }));
    if (operation.op === "replaceAvailabilityRules") week.availabilityRules = operation.items;
  });
};

const applyRollingPlan = ({ plan, week, weekKey }) => {
  const validation = validateAiRollingPlan({ plan, week });
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  const minorGoalIdMap = new Map();
  const nextMinorGoals = (validation.plan.minorGoals || []).map((item) => {
    const createdMinorGoal = createMinorGoal({
      majorGoalId: resolveMajorGoal(item, week.goals),
      title: item.title,
      deadlineIso: item.deadline ? `${item.deadline}T23:59:59` : "",
      status: item.status || "active",
      notes: item.notes || "",
      source: "ai",
    });
    const sourceMinorGoalId = String(item.id || "");
    if (sourceMinorGoalId) minorGoalIdMap.set(sourceMinorGoalId, createdMinorGoal.id);
    const sourceMinorGoalTitleKey = titleKey(item.title);
    if (sourceMinorGoalTitleKey) minorGoalIdMap.set(`title:${sourceMinorGoalTitleKey}`, createdMinorGoal.id);
    return createdMinorGoal;
  });

  const resolveAppliedTaskMinorGoalId = (item) => {
    const sourceMinorGoalId = String(item.minorGoalId || "");
    if (sourceMinorGoalId && minorGoalIdMap.has(sourceMinorGoalId)) {
      return String(minorGoalIdMap.get(sourceMinorGoalId) || "");
    }
    const sourceMinorGoalTitleKey = titleKey(item.minorGoalTitle);
    if (sourceMinorGoalTitleKey && minorGoalIdMap.has(`title:${sourceMinorGoalTitleKey}`)) {
      return String(minorGoalIdMap.get(`title:${sourceMinorGoalTitleKey}`) || "");
    }
    return resolveMinorGoalId(item, nextMinorGoals);
  };

  const nextTasks = (validation.plan.tasks || []).map((item) =>
    createTask({
      weekKey,
      title: item.title,
      estimateMinutes: item.estimateMinutes,
      priority: 3,
      energy: item.energy || "deep",
      majorGoalId: "",
      minorGoalId: resolveAppliedTaskMinorGoalId(item),
      status: item.status || "not_started",
      source: "ai",
    }));

  const aiDraft = buildAiDraftFromRollingPlan(validation.plan, week.profile);
  week.minorGoals = nextMinorGoals;
  week.tasks = nextTasks;
  week.managedSlots = (aiDraft?.slots || []).map((slot) => ({
    ...slot,
    lifeosManaged: true,
    persistedFromAiApply: true,
    planRunId: `run_${Date.now().toString(36)}`,
  }));
};

export const applyPlannerAiOperations = ({ plan, week, weekKey }) => {
  if (plan.kind === "rolling_v3_in_progress") {
    throw new Error("Schedule plan is still in progress. Continue AI Q&A and import schedule_ready JSON.");
  }
  if (plan.kind === "rolling_v3") {
    applyRollingPlan({ plan, week, weekKey });
  } else {
    applyLegacyOperations({ plan, week, weekKey });
  }
};
