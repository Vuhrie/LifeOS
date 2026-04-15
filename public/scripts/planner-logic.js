import { buildAiBridgePrompt } from "./ai-bridge-prompts.js";
import { buildPlanningWindows } from "./planner-policy.js";
import { createMinorGoal, createStaticCommitment, createTask } from "./planner-storage.js";

export const createPlannerLogic = ({
  ui,
  week,
  weekKey,
  upsertGoal,
  save,
  rerenderAll,
  refreshAvailabilityFromProfile,
  applyUiFromState,
  writeClient,
  lastAuthStateRef,
}) => {
  const autoMinorGoals = (goal) => {
    const items = [createMinorGoal({ weekKey, title: goal.title, targetHours: goal.weeklyHours })];
    const { gym, leisure } = week.profile.habits;
    if (gym.enabled && gym.frequency > 0) items.push(createMinorGoal({ weekKey, title: "Gym Session", targetHours: gym.frequency }));
    if (leisure.enabled && leisure.frequency > 0) items.push(createMinorGoal({ weekKey, title: "Leisure / Recovery", targetHours: Number((leisure.frequency * 1.5).toFixed(1)) }));
    return items;
  };

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
      goal: { title: ui.goalTitle.value.trim(), deadline: ui.goalDeadline.value, priority: Number(ui.goalPriority.value), weeklyHours: Number(ui.goalHours.value) },
      profile: week.profile,
      settings: week.settings,
      minorGoals: week.minorGoals.map(({ title, targetHours }) => ({ title, targetHours })),
      tasks: week.tasks.map(({ title, estimateMinutes, priority, energy }) => ({ title, estimateMinutes, priority, energy })),
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
    });
  };

  const applyAiOperations = (plan, summaryFn) => {
    plan.operations.forEach((operation) => {
      if (operation.op === "setGoal") {
        ui.goalTitle.value = operation.value.title;
        ui.goalDeadline.value = operation.value.deadline;
        ui.goalPriority.value = String(operation.value.priority);
        ui.goalHours.value = String(operation.value.weeklyHours);
        upsertGoal();
      }
      if (operation.op === "setProfile") {
        const value = operation.value || {};
        if (value.wakeTime) week.profile.wakeTime = value.wakeTime;
        if (value.sleepTime) week.profile.sleepTime = value.sleepTime;
        if (value.habits) week.profile.habits = { ...week.profile.habits, ...value.habits };
        if (value.necessities) week.profile.necessities = { ...week.profile.necessities, ...value.necessities };
      }
      if (operation.op === "setHorizon") week.settings = { ...week.settings, ...operation.value };
      if (operation.op === "replaceStaticCommitments") week.profile.staticCommitments = operation.items.map((item) => createStaticCommitment(item));
      if (operation.op === "replaceMinorGoals") week.minorGoals = operation.items.map((item) => createMinorGoal({ weekKey, ...item }));
      if (operation.op === "replaceTasks") week.tasks = operation.items.map((item) => createTask({ weekKey, ...item }));
      if (operation.op === "replaceAvailabilityRules") week.availabilityRules = operation.items;
    });
    applyUiFromState();
    refreshAvailabilityFromProfile();
    rerenderAll();
    save();
    return summaryFn(plan);
  };

  return { autoMinorGoals, buildPromptContext, applyAiOperations };
};

