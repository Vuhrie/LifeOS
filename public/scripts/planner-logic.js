import { buildAiBridgePrompt } from "./ai-bridge-prompts.js";
import { buildPlanningWindows } from "./planner-policy.js";
import { createCommitment, createGoal, createHabit, createTask } from "./planner-storage.js";

export const createPlannerLogic = ({
  ui,
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
          title: `${habit.name} Session ${index + 1}`,
          estimateMinutes: duration,
          priority: 3,
          energy: habit.window === "night" ? "light" : "deep",
        }));
    });

  const buildPromptContext = async () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(now.getDate() + week.settings.horizonDays);
    const events = lastAuthStateRef.current.isSignedIn
      ? await writeClient.fetchExistingEvents({ startIso: now.toISOString(), endIso: end.toISOString() })
      : [];
    const capacity = buildPlanningWindows({
      horizonStart: now,
      horizonDays: week.settings.horizonDays,
      profile: week.profile,
      availabilityRules: week.availabilityRules,
      reservedSlots: week.managedSlots,
    });
    return buildAiBridgePrompt({
      goal: null,
      profile: week.profile,
      settings: week.settings,
      minorGoals: [],
      tasks: week.tasks,
      availabilityRules: week.availabilityRules,
      managedSlots: week.managedSlots,
      scheduleContext: {
        weekKey,
        horizonStart: now.toISOString(),
        horizonEnd: end.toISOString(),
        existingCalendarEvents: events,
        hardBlocks: capacity.hardBlocks.map((item) => ({ title: item.title, start: item.start.toISOString(), end: item.end.toISOString(), source: item.source })),
        capacityByWindow: capacity.windows.map((item) => ({ start: item.start.toISOString(), end: item.end.toISOString(), maxMinutes: item.maxMinutes })),
      },
      policy: { lockHorizonHours: week.settings.lockedHorizonHours, preserveManagedSlots: true, minimizeChurn: true },
      current: {
        goals: week.goals,
        habits: week.habits,
        commitments: week.profile.commitments,
      },
    });
  };

  const applyAiOperations = (plan, summaryFn) => {
    plan.operations.forEach((operation) => {
      if (operation.op === "setProfile") {
        const value = operation.value || {};
        if (value.wakeTime) week.profile.wakeTime = value.wakeTime;
        if (value.sleepTime) week.profile.sleepTime = value.sleepTime;
        if (value.necessities) week.profile.necessities = { ...week.profile.necessities, ...value.necessities };
      }
      if (operation.op === "setHorizon") week.settings = { ...week.settings, ...operation.value };
      if (operation.op === "replaceGoals") week.goals = operation.items.map((item) => createGoal({ title: item.title, deadlineIso: `${item.deadline}T23:59:59`, priority: item.priority, weeklyHours: item.weeklyHours }));
      if (operation.op === "replaceHabits") week.habits = operation.items.map((item) => createHabit(item));
      if (operation.op === "replaceCommitments") week.profile.commitments = operation.items.map((item) => createCommitment(item));
      if (operation.op === "replaceTasks") week.tasks = operation.items.map((item) => createTask({ weekKey, ...item }));
      if (operation.op === "replaceAvailabilityRules") week.availabilityRules = operation.items;
    });
    applyUiFromState();
    refreshAvailabilityFromProfile();
    rerenderAll();
    save();
    return summaryFn(plan);
  };

  return { habitsAsTasks, buildPromptContext, applyAiOperations };
};

