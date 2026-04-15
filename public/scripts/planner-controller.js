import { createCalendarWriteClient } from "./calendar-write-client.js";
import { parseAiBridgePlan, summarizeAiBridgePlan } from "./ai-bridge-parser.js";
import { createAiBridgeUi } from "./ai-bridge-ui.js";
import { generateDraftPlan, previewOverlapWarnings } from "./planner-engine.js";
import { createPlannerLogic } from "./planner-logic.js";
import {
  buildAvailabilityRulesFromProfile,
  createFixedCommitment,
  createGoal,
  createMinorGoal,
  createStaticCommitment,
  createTask,
  ensureWeekState,
  getPlanningWeekKey,
  loadPlannerState,
  normalizeTime,
  rotateWeekIfNeeded,
  savePlannerState,
  toMinutes,
} from "./planner-storage.js";
import { createPlannerView } from "./planner-view.js";
import { applyGoogleConnectButtonState } from "./google-connect-button.js";
import { getSelectedStaticDays } from "./planner-dom.js";

export const initPlannerController = (ui) => {
  const view = createPlannerView(ui);
  const app = loadPlannerState();
  const weekKey = rotateWeekIfNeeded(app, new Date());
  const week = ensureWeekState(app, weekKey);
  const save = () => savePlannerState(app);
  let currentStep = 1;
  const lastAuthStateRef = { current: { isConfigured: true, isSignedIn: false, isLoading: false, error: "" } };

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
    staticCommitments: week.profile.staticCommitments,
    necessities: {
      breakfast: { enabled: true, durationMinutes: Number(ui.needBreakfast.value) || 30 },
      dinner: { enabled: true, durationMinutes: Number(ui.needDinner.value) || 45 },
      shower: { enabled: true, durationMinutes: Number(ui.needShower.value) || 20 },
    },
    habits: {
      gym: { enabled: ui.gymEnabled.checked, frequency: Number(ui.gymFrequency.value) || 0 },
      leisure: { enabled: ui.leisureEnabled.checked, frequency: Number(ui.leisureFrequency.value) || 0 },
    },
  });

  const settingsFromUi = () => ({
    horizonDays: Math.max(1, Math.min(14, Number(ui.horizonDays.value) || 7)),
    lockedHorizonHours: Math.max(0, Math.min(48, Number(ui.lockedHours.value) || 12)),
  });

  const applyUiFromState = () => {
    ui.wake.value = week.profile.wakeTime;
    ui.sleep.value = week.profile.sleepTime;
    ui.horizonDays.value = String(week.settings.horizonDays);
    ui.lockedHours.value = String(week.settings.lockedHorizonHours);
    ui.needBreakfast.value = String(week.profile.necessities.breakfast.durationMinutes);
    ui.needDinner.value = String(week.profile.necessities.dinner.durationMinutes);
    ui.needShower.value = String(week.profile.necessities.shower.durationMinutes);
    ui.gymEnabled.checked = week.profile.habits.gym.enabled;
    ui.gymFrequency.value = String(week.profile.habits.gym.frequency);
    ui.leisureEnabled.checked = week.profile.habits.leisure.enabled;
    ui.leisureFrequency.value = String(week.profile.habits.leisure.frequency);
  };

  const refreshAvailabilityFromProfile = () => { week.availabilityRules = buildAvailabilityRulesFromProfile(week.profile); };
  const rerenderAll = () => {
    view.renderFixedCommitments(week.profile.fixedCommitments);
    view.renderStaticCommitments(week.profile.staticCommitments);
    view.renderMinorGoals(week.minorGoals);
    view.renderTasks(week.tasks);
    view.renderAvailability(week.availabilityRules);
    view.renderDraft(week.draft);
  };
  const onProfileChange = () => {
    week.profile = profileFromUi();
    week.settings = settingsFromUi();
    refreshAvailabilityFromProfile();
    save();
    rerenderAll();
  };
  const renderGoogleAuthState = (state) => applyGoogleConnectButtonState(ui.connect, state);

  const writeClient = createCalendarWriteClient({
    onStateChange: (state) => {
      lastAuthStateRef.current = state;
      ui.commit.disabled = !state.isSignedIn || state.isLoading;
      renderGoogleAuthState(state);
      if (state.error) view.setStatus(state.error, "error");
    },
  });
  const logic = createPlannerLogic({
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
  });

  const aiBridge = createAiBridgeUi({
    output: ui.aiPromptOutput,
    importInput: ui.aiImportInput,
    status: ui.aiStatus,
    buildButton: ui.aiBuildPrompt,
    copyButton: ui.aiCopyPrompt,
    validateButton: ui.aiValidateImport,
    applyButton: ui.aiApplyImport,
    clearButton: ui.aiClearImport,
    onBuildPrompt: async () => logic.buildPromptContext(),
    onValidateImport: (text) => parseAiBridgePlan(text),
    onApplyImport: (plan) => logic.applyAiOperations(plan, summarizeAiBridgePlan),
    onPersist: (next) => { week.aiAssist = { ...week.aiAssist, ...next }; save(); },
  });

  ui.connect.addEventListener("click", async () => {
    if (lastAuthStateRef.current.isSignedIn) return view.setStatus("Google Calendar is already connected.", "success");
    try { await writeClient.connect(); view.setStatus("Google Calendar write access connected.", "success"); } catch (error) { writeClient.setError(error.message); }
  });
  ui.prev.addEventListener("click", () => { currentStep = view.setStep(currentStep - 1); });
  ui.next.addEventListener("click", () => { currentStep = view.setStep(currentStep + 1); });
  ui.stepPills.forEach((pill) => pill.addEventListener("click", () => { currentStep = view.setStep(Number(pill.dataset.step)); }));
  [ui.wake, ui.sleep, ui.horizonDays, ui.lockedHours, ui.needBreakfast, ui.needDinner, ui.needShower, ui.gymEnabled, ui.gymFrequency, ui.leisureEnabled, ui.leisureFrequency].forEach((input) => input.addEventListener("change", onProfileChange));

  ui.addFixed.addEventListener("click", () => {
    const day = Number(ui.fixedDay.value);
    const start = normalizeTime(ui.fixedStart.value, "09:00");
    const end = normalizeTime(ui.fixedEnd.value, "18:00");
    if (toMinutes(end) <= toMinutes(start)) return view.setStatus("Commitment end time must be after start time.", "warning");
    week.profile.fixedCommitments.push(createFixedCommitment({ day, start, end }));
    onProfileChange();
    view.setStatus("Fixed commitment added.", "success");
  });
  ui.addStatic.addEventListener("click", () => {
    const title = ui.staticTitle.value.trim() || "Static commitment";
    const startDate = ui.staticStartDate.value;
    const endDate = ui.staticEndDate.value;
    const start = normalizeTime(ui.staticStart.value, "09:00");
    const end = normalizeTime(ui.staticEnd.value, "18:00");
    const days = getSelectedStaticDays(ui.staticDays);
    if (!startDate || !endDate || !days.length || toMinutes(end) <= toMinutes(start)) return view.setStatus("Static commitment needs date range, weekdays, and valid time.", "warning");
    week.profile.staticCommitments.push(createStaticCommitment({ title, startDate, endDate, days, start, end }));
    ui.staticTitle.value = "";
    onProfileChange();
    view.setStatus("Static commitment added.", "success");
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
    const staticId = target.getAttribute("data-rm-static");
    const minorId = target.getAttribute("data-rm-minor");
    const taskId = target.getAttribute("data-rm-task");
    if (fixedId) week.profile.fixedCommitments = week.profile.fixedCommitments.filter((item) => item.id !== fixedId);
    if (staticId) week.profile.staticCommitments = week.profile.staticCommitments.filter((item) => item.id !== staticId);
    if (minorId) week.minorGoals = week.minorGoals.filter((item) => item.id !== minorId);
    if (taskId) week.tasks = week.tasks.filter((item) => item.id !== taskId);
    if (fixedId || staticId) onProfileChange();
    if (minorId || taskId) { save(); rerenderAll(); }
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
    const horizonStart = new Date();
    horizonStart.setHours(0, 0, 0, 0);
    const draft = generateDraftPlan({
      goal,
      minorGoals: [...logic.autoMinorGoals(goal), ...week.minorGoals],
      tasks: week.tasks,
      availabilityRules: week.availabilityRules,
      horizonStart,
      horizonDays: week.settings.horizonDays,
      profile: week.profile,
      existingSlots: week.managedSlots,
      lockedHorizonHours: week.settings.lockedHorizonHours,
    });
    week.draft = draft;
    week.managedSlots = draft.slots.map((slot) => ({ ...slot, lifeosManaged: true, planRunId: `run_${Date.now().toString(36)}` }));
    week.planRuns.push({ at: new Date().toISOString(), metrics: draft.metrics });
    if (week.planRuns.length > 20) week.planRuns = week.planRuns.slice(-20);
    if (draft.validation.ok && writeClient.getState().isSignedIn) {
      const end = new Date(horizonStart);
      end.setDate(horizonStart.getDate() + week.settings.horizonDays);
      try {
        const events = await writeClient.fetchExistingEvents({ startIso: horizonStart.toISOString(), endIso: end.toISOString() });
        draft.warnings = previewOverlapWarnings(draft.slots, events);
      } catch (error) {
        view.setStatus(`Draft generated. Conflict preview unavailable: ${error.message}`, "warning");
      }
    }
    save();
    view.renderDraft(draft);
    if (!draft.validation.ok) return view.setStatus(draft.validation.errors.join(" "), "warning");
    view.setStatus(`Draft ready: ${draft.metrics.unchangedCount} kept, ${draft.metrics.addedCount} new, ${draft.metrics.removedCount} removed.`, "success");
    currentStep = view.setStep(3);
  });
  ui.clear.addEventListener("click", () => { week.draft = null; save(); view.renderDraft(null); view.setStatus("Draft cleared.", "neutral"); });
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

  if (!week.profile) week.profile = profileFromUi();
  if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
  const goal = app.goals.find((item) => item.status === "active");
  if (goal) {
    ui.goalTitle.value = goal.title;
    ui.goalDeadline.value = goal.deadlineIso.slice(0, 10);
    ui.goalPriority.value = String(goal.priority);
    ui.goalHours.value = String(goal.weeklyHours);
  }
  applyUiFromState();
  rerenderAll();
  aiBridge.hydrateSavedState(week.aiAssist);
  renderGoogleAuthState(writeClient.getState());
  currentStep = view.setStep(1);
  view.setStatus(`Planner ready for week ${getPlanningWeekKey(new Date())}.`, "neutral");
  save();
};
