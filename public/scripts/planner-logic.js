import { buildAiBridgePrompt } from "./ai-bridge-prompts.js";
import { buildPlanningWindows } from "./planner-policy.js";
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

const buildAiDraftFromRollingPlan = (plan) => {
  const slots = [];
  const days = (plan.rollingPlan || []).map((day) => ({
    date: new Date(`${day.date}T00:00:00`),
    items: (day.items || []).map((item, index) => ({
      id: `${day.date}_${index}_${item.type}`,
      start: toDateFromDayTime(day.date, item.start),
      end: toDateFromDayTime(day.date, item.end),
      title: item.title,
      sourceId: item.sourceId || "",
      kind: item.type === "commitment" ? "commitment" : "planned",
      badge: item.type === "commitment" ? "Commitment" : item.type === "habit" ? "Habit" : item.type === "necessity" ? "Necessity" : "Planned",
    })),
  }));
  days.forEach((day) => {
    day.items.forEach((item) => {
      if (item.kind === "commitment") return;
      slots.push({
        id: item.id,
        sourceId: item.sourceId || item.id,
        title: item.title,
        type: "task",
        energy: "deep",
        durationMinutes: Math.max(15, Math.round((item.end - item.start) / 60000)),
        start: item.start,
        end: item.end,
        score: 0,
        preserved: false,
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

export const createPlannerLogic = ({
  week,
  weekKey,
  save,
  rerenderAll,
  refreshAvailabilityFromProfile,
  applyUiFromState,
  writeClient,
  lastAuthStateRef,
}) => {
  const habitsAsTasks = () =>
    week.habits.flatMap((habit) => {
      const count = Math.max(0, Number(habit.frequency || 0));
      const duration = Math.max(15, Number(habit.durationMinutes || 60));
      return Array.from({ length: count }).map((_, index) =>
        createTask({
          weekKey,
          title: `${habit.name}`,
          estimateMinutes: duration,
          priority: 3,
          energy: habit.window === "night" ? "light" : "deep",
          habitId: habit.id,
          preferredWindow: habit.window,
          source: "deterministic",
        }));
    });

  const buildPromptContext = async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const dismissedGoogleIds = new Set(
      (week.dismissedGoogleCommitmentIds || []).map((item) => String(item || "")).filter(Boolean),
    );
    const ignoredGoogleIds = new Set(
      (week.ignoredGoogleEventIds || []).map((item) => String(item || "")).filter(Boolean),
    );
    const eventsRaw = lastAuthStateRef.current.isSignedIn
      ? await writeClient.fetchExistingEvents({ startIso: start.toISOString(), endIso: end.toISOString() })
      : [];
    const events = (eventsRaw || []).filter((event) => {
      const eventId = String(event?.id || "");
      if (!eventId) return true;
      return !dismissedGoogleIds.has(eventId) && !ignoredGoogleIds.has(eventId);
    });
    const promptCommitments = (week.profile.commitments || []).filter((item) => {
      if (String(item.source || "") !== "google_imported") return true;
      const eventId = String(item.googleEventId || "");
      return !eventId || !dismissedGoogleIds.has(eventId);
    });
    const capacity = buildPlanningWindows({
      horizonStart: start,
      horizonDays: 7,
      profile: week.profile,
      availabilityRules: week.availabilityRules,
      // AI prompt context should not lock in previously managed slots.
      reservedSlots: [],
    });

    return buildAiBridgePrompt({
      definedElements: {
        dailyRhythm: { wakeTime: week.profile.wakeTime, sleepTime: week.profile.sleepTime },
        necessities: week.profile.necessities,
        commitments: promptCommitments,
        habits: week.habits,
        majorGoals: week.goals,
      },
      aiManaged: {
        minorGoals: week.minorGoals,
        tasks: week.tasks,
      },
      plannerInputs: week.aiPlannerInputs || {},
      scheduleContext: {
        weekKey,
        rollingStart: start.toISOString(),
        rollingEnd: end.toISOString(),
        existingCalendarEvents: events,
        hardBlocks: capacity.hardBlocks.map((item) => ({
          title: item.title,
          start: item.start.toISOString(),
          end: item.end.toISOString(),
          source: item.source,
        })),
        capacityByWindow: capacity.windows.map((item) => ({
          start: item.start.toISOString(),
          end: item.end.toISOString(),
          maxMinutes: item.maxMinutes,
        })),
      },
      policy: {
        rollingDays: 7,
        rollingExcludesToday: true,
        habitsUseMondaySundayWeek: true,
        habitMaxPerDayDefault: 1,
        dismissedGoogleEventIds: [...dismissedGoogleIds],
        aiMayModify: ["minorGoals", "tasks", "habitExecutionTiming", "necessityExecutionTiming"],
        aiMayNotModify: ["majorGoals", "commitments", "dailyRhythm", "necessityDefinitions", "habitDefinitions"],
      },
    });
  };

  const applyLegacyOperations = (plan) => {
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
            priority: item.priority,
            weeklyHours: item.weeklyHours,
          }));
      }
      if (operation.op === "replaceHabits") week.habits = operation.items.map((item) => createHabit(item));
      if (operation.op === "replaceCommitments") week.profile.commitments = operation.items.map((item) => createCommitment(item));
      if (operation.op === "replaceTasks") week.tasks = operation.items.map((item) => createTask({ weekKey, ...item }));
      if (operation.op === "replaceAvailabilityRules") week.availabilityRules = operation.items;
    });
  };

  const applyRollingPlan = (plan) => {
    const validation = validateAiRollingPlan({ plan, week });
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }

    const nextMinorGoals = (validation.plan.minorGoals || []).map((item) =>
      createMinorGoal({
        majorGoalId: resolveMajorGoal(item, week.goals),
        title: item.title,
        deadlineIso: item.deadline ? `${item.deadline}T23:59:59` : "",
        status: item.status || "active",
        notes: item.notes || "",
        source: "ai",
      }));

    const nextTasks = (validation.plan.tasks || []).map((item) =>
      createTask({
        weekKey,
        title: item.title,
        estimateMinutes: item.estimateMinutes,
        priority: 3,
        energy: item.energy || "deep",
        majorGoalId: "",
        minorGoalId: resolveMinorGoalId(item, nextMinorGoals),
        status: item.status || "not_started",
        source: "ai",
      }));

    week.minorGoals = nextMinorGoals;
    week.tasks = nextTasks;
    week.draft = buildAiDraftFromRollingPlan(validation.plan);
    week.managedSlots = (week.draft?.slots || []).map((slot) => ({
      ...slot,
      lifeosManaged: true,
      planRunId: `run_${Date.now().toString(36)}`,
    }));
  };

  const applyAiOperations = (plan, summaryFn) => {
    if (plan.kind === "rolling_v3") {
      applyRollingPlan(plan);
    } else {
      applyLegacyOperations(plan);
    }
    applyUiFromState();
    refreshAvailabilityFromProfile();
    rerenderAll();
    save();
    return summaryFn(plan);
  };

  return { habitsAsTasks, buildPromptContext, applyAiOperations };
};
