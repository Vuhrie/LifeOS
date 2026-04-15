import { createCalendarWriteClient } from "./calendar-write-client.js";
import { generateDraftPlan, previewOverlapWarnings } from "./planner-engine.js";
import {
  buildAvailabilityRulesFromProfile,
  createFixedCommitment,
  createGoal,
  createMinorGoal,
  createTask,
  ensureWeekState,
  getPlanningWeekKey,
  getWeekStartFromKey,
  loadPlannerState,
  normalizeTime,
  rotateWeekIfNeeded,
  savePlannerState,
  toMinutes,
} from "./planner-storage.js";
import { createPlannerView } from "./planner-view.js";

const $ = (id) => document.querySelector(id);
const ui = {
  status: $("#planner-status"),
  connect: $("#connect-google"),
  commit: $("#commit-draft"),
  generate: $("#generate-draft"),
  clear: $("#clear-draft"),
  stepPills: [...document.querySelectorAll(".step-pill")],
  stepPanels: [...document.querySelectorAll(".wizard-step")],
  prev: $("#step-prev"),
  next: $("#step-next"),
  wake: $("#wake-time"),
  sleep: $("#sleep-time"),
  fixedDay: $("#fixed-day"),
  fixedStart: $("#fixed-start"),
  fixedEnd: $("#fixed-end"),
  addFixed: $("#add-fixed"),
  fixedList: $("#fixed-list"),
  goalTitle: $("#goal-title"),
  goalDeadline: $("#goal-deadline"),
  goalPriority: $("#goal-priority"),
  goalHours: $("#goal-weekly-hours"),
  gymEnabled: $("#habit-gym-enabled"),
  leisureEnabled: $("#habit-leisure-enabled"),
  gymFrequency: $("#habit-gym-frequency"),
  leisureFrequency: $("#habit-leisure-frequency"),
  minorTitle: $("#minor-goal-title"),
  minorHours: $("#minor-goal-hours"),
  addMinor: $("#add-minor-goal"),
  minorList: $("#minor-goals-list"),
  taskTitle: $("#task-title"),
  taskEstimate: $("#task-estimate"),
  taskPriority: $("#task-priority"),
  taskEnergy: $("#task-energy"),
  addTask: $("#add-task"),
  taskList: $("#tasks-list"),
  availability: $("#availability-grid"),
  draftList: $("#draft-list"),
  unscheduledList: $("#unscheduled-list"),
  warningsList: $("#warnings-list"),
};

const view = createPlannerView(ui);
const app = loadPlannerState();
const weekKey = rotateWeekIfNeeded(app, new Date());
const week = ensureWeekState(app, weekKey);
const save = () => savePlannerState(app);

let currentStep = 1;

const goalFromUi = () => ({
  title: ui.goalTitle.value.trim(),
  deadlineIso: ui.goalDeadline.value ? `${ui.goalDeadline.value}T23:59:59` : "",
  priority: Number(ui.goalPriority.value),
  weeklyHours: Number(ui.goalHours.value),
});

const upsertGoal = () => {
  const payload = goalFromUi();
  let goal = app.goals.find((item) => item.status === "active");
  if (!goal) {
    goal = createGoal(payload);
    app.goals = [goal];
  } else {
    Object.assign(goal, payload);
  }
  return goal;
};

const profileFromUi = () => ({
  wakeTime: normalizeTime(ui.wake.value, week.profile.wakeTime),
  sleepTime: normalizeTime(ui.sleep.value, week.profile.sleepTime),
  fixedCommitments: week.profile.fixedCommitments,
  habits: {
    gym: { enabled: ui.gymEnabled.checked, frequency: Number(ui.gymFrequency.value) || 0 },
    leisure: { enabled: ui.leisureEnabled.checked, frequency: Number(ui.leisureFrequency.value) || 0 },
  },
});

const applyProfileToUi = () => {
  ui.wake.value = week.profile.wakeTime;
  ui.sleep.value = week.profile.sleepTime;
  ui.gymEnabled.checked = week.profile.habits.gym.enabled;
  ui.gymFrequency.value = String(week.profile.habits.gym.frequency);
  ui.leisureEnabled.checked = week.profile.habits.leisure.enabled;
  ui.leisureFrequency.value = String(week.profile.habits.leisure.frequency);
};

const refreshAvailabilityFromProfile = () => {
  week.availabilityRules = buildAvailabilityRulesFromProfile(week.profile);
};

const onProfileChange = () => {
  week.profile = profileFromUi();
  refreshAvailabilityFromProfile();
  save();
  view.renderAvailability(week.availabilityRules);
};

const autoMinorGoals = (goal) => {
  const items = [createMinorGoal({ weekKey, title: goal.title, targetHours: goal.weeklyHours })];
  const gym = week.profile.habits.gym;
  const leisure = week.profile.habits.leisure;
  if (gym.enabled && gym.frequency > 0) items.push(createMinorGoal({ weekKey, title: "Gym Session", targetHours: Number((gym.frequency * 1).toFixed(1)) }));
  if (leisure.enabled && leisure.frequency > 0) items.push(createMinorGoal({ weekKey, title: "Leisure / Recovery", targetHours: Number((leisure.frequency * 1.5).toFixed(1)) }));
  return items;
};

const rerenderAll = () => {
  view.renderFixedCommitments(week.profile.fixedCommitments);
  view.renderMinorGoals(week.minorGoals);
  view.renderTasks(week.tasks);
  view.renderAvailability(week.availabilityRules);
  view.renderDraft(week.draft);
};

const writeClient = createCalendarWriteClient({
  onStateChange: (state) => {
    ui.commit.disabled = !state.isSignedIn || state.isLoading;
    if (state.error) view.setStatus(state.error, "error");
  },
});

ui.connect.addEventListener("click", async () => {
  try {
    await writeClient.connect();
    view.setStatus("Google Calendar write access connected.", "success");
  } catch (error) {
    writeClient.setError(error.message);
  }
});

ui.prev.addEventListener("click", () => {
  currentStep = view.setStep(currentStep - 1);
});
ui.next.addEventListener("click", () => {
  currentStep = view.setStep(currentStep + 1);
});
ui.stepPills.forEach((pill) =>
  pill.addEventListener("click", () => {
    currentStep = view.setStep(Number(pill.dataset.step));
  }),
);

[ui.wake, ui.sleep, ui.gymEnabled, ui.gymFrequency, ui.leisureEnabled, ui.leisureFrequency].forEach((input) => input.addEventListener("change", onProfileChange));

ui.addFixed.addEventListener("click", () => {
  const day = Number(ui.fixedDay.value);
  const start = normalizeTime(ui.fixedStart.value, "09:00");
  const end = normalizeTime(ui.fixedEnd.value, "18:00");
  if (toMinutes(end) <= toMinutes(start)) return view.setStatus("Commitment end time must be after start time.", "warning");
  week.profile.fixedCommitments.push(createFixedCommitment({ day, start, end }));
  refreshAvailabilityFromProfile();
  save();
  rerenderAll();
  view.setStatus("Fixed commitment added.", "success");
});

ui.addMinor.addEventListener("click", () => {
  const title = ui.minorTitle.value.trim();
  const targetHours = Number(ui.minorHours.value);
  if (!title || targetHours <= 0) return view.setStatus("Minor goal title and hours are required.", "warning");
  week.minorGoals.push(createMinorGoal({ weekKey, title, targetHours }));
  ui.minorTitle.value = "";
  save();
  view.renderMinorGoals(week.minorGoals);
});

ui.addTask.addEventListener("click", () => {
  const title = ui.taskTitle.value.trim();
  const estimateMinutes = Number(ui.taskEstimate.value);
  if (!title || estimateMinutes < 30) return view.setStatus("Task title and estimate (>=30 mins) are required.", "warning");
  week.tasks.push(createTask({ weekKey, title, estimateMinutes, priority: Number(ui.taskPriority.value), energy: ui.taskEnergy.value }));
  ui.taskTitle.value = "";
  save();
  view.renderTasks(week.tasks);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const fixedId = target.getAttribute("data-rm-fixed");
  if (fixedId) {
    week.profile.fixedCommitments = week.profile.fixedCommitments.filter((item) => item.id !== fixedId);
    refreshAvailabilityFromProfile();
    save();
    rerenderAll();
    return;
  }
  const minorId = target.getAttribute("data-rm-minor");
  if (minorId) {
    week.minorGoals = week.minorGoals.filter((item) => item.id !== minorId);
    save();
    view.renderMinorGoals(week.minorGoals);
    return;
  }
  const taskId = target.getAttribute("data-rm-task");
  if (taskId) {
    week.tasks = week.tasks.filter((item) => item.id !== taskId);
    save();
    view.renderTasks(week.tasks);
  }
});

ui.availability.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const row = input.closest(".availability-row");
  if (!row) return;
  const rule = week.availabilityRules.find((item) => item.day === Number(row.getAttribute("data-day")));
  if (!rule) return;
  const field = input.getAttribute("data-field");
  if (field === "start" || field === "end") rule[field] = normalizeTime(input.value, rule[field]);
  if (field === "maxHours") rule.maxHours = Number(input.value) || rule.maxHours;
  if (field === "maxDeepBlocks") rule.maxDeepBlocks = Number(input.value) || rule.maxDeepBlocks;
  save();
});

ui.generate.addEventListener("click", async () => {
  const goal = upsertGoal();
  if (!goal.title || !goal.deadlineIso || goal.weeklyHours <= 0) return view.setStatus("Goal title, deadline, and weekly hours are required.", "warning");
  const weekStart = getWeekStartFromKey(weekKey);
  const draft = generateDraftPlan({
    goal,
    minorGoals: [...autoMinorGoals(goal), ...week.minorGoals],
    tasks: week.tasks,
    availabilityRules: week.availabilityRules,
    weekStart,
  });
  week.draft = draft;
  if (draft.validation.ok && writeClient.getState().isSignedIn) {
    try {
      const events = await writeClient.fetchExistingEvents({ startIso: weekStart.toISOString(), endIso: new Date(weekStart.getTime() + 7 * 86400000).toISOString() });
      draft.warnings = previewOverlapWarnings(draft.slots, events);
    } catch (error) {
      view.setStatus(`Draft generated. Conflict preview unavailable: ${error.message}`, "warning");
    }
  }
  save();
  view.renderDraft(draft);
  if (!draft.validation.ok) return view.setStatus(draft.validation.errors.join(" "), "warning");
  view.setStatus(`Draft generated.${draft.warnings.length ? ` ${draft.warnings.length} overlap warnings found.` : ""}`, "success");
  currentStep = view.setStep(3);
});

ui.clear.addEventListener("click", () => {
  week.draft = null;
  save();
  view.renderDraft(null);
  view.setStatus("Draft cleared.", "neutral");
});

ui.commit.addEventListener("click", async () => {
  if (!week.draft?.slots?.length) return view.setStatus("Generate a draft before committing.", "warning");
  try {
    const result = await writeClient.commitDraft(week.draft.slots);
    week.commitLog.push({ commitId: result.commitId, timestamp: new Date().toISOString(), writes: result.writes, warningCount: week.draft.warnings.length });
    save();
    view.setStatus(`Committed ${result.writes.length} events to Google Calendar.`, "success");
  } catch (error) {
    view.setStatus(`Commit failed: ${error.message}`, "error");
  }
});

(() => {
  if (!week.profile) week.profile = profileFromUi();
  if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
  const goal = app.goals.find((item) => item.status === "active");
  if (goal) {
    ui.goalTitle.value = goal.title;
    ui.goalDeadline.value = goal.deadlineIso.slice(0, 10);
    ui.goalPriority.value = String(goal.priority);
    ui.goalHours.value = String(goal.weeklyHours);
  }
  applyProfileToUi();
  rerenderAll();
  currentStep = view.setStep(1);
  const note = getPlanningWeekKey(new Date()) === weekKey ? "" : " Week rotated to new cycle.";
  view.setStatus(`Planner ready for week ${weekKey}.${note}`, "neutral");
  save();
})();
