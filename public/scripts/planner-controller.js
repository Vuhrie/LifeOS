import { createCalendarWriteClient } from "./calendar-write-client.js";
import { createAiBridgeUi } from "./ai-bridge-ui.js";
import { parseAiBridgePlan, summarizeAiBridgePlan } from "./ai-bridge-parser.js";
import { createPlannerLogic } from "./planner-logic.js";
import { generateDraftPlan, previewOverlapWarnings } from "./planner-engine.js";
import { buildPlannerPreview } from "./planner-preview-model.js";
import {
  buildAvailabilityRulesFromProfile,
  createCommitment,
  createGoal,
  createHabit,
  ensureWeekState,
  getPlanningWeekKey,
  loadPlannerState,
  normalizeTime,
  rotateWeekIfNeeded,
  savePlannerState,
} from "./planner-storage.js";
import { createPlannerView } from "./planner-view.js";
import { applyGoogleConnectButtonState } from "./google-connect-button.js";
import { createCommitmentTypeUi } from "./planner-commitment-ui.js";
import { validateCommitmentInput } from "./planner-validation.js";
import { createPlannerSyncClient } from "./planner-sync-client.js";

const dateOnly = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export const initPlannerController = (ui) => {
  let accountKey = "anon";
  let app = loadPlannerState(accountKey);
  let weekKey = rotateWeekIfNeeded(app, new Date());
  let week = ensureWeekState(app, weekKey);
  const save = () => {
    savePlannerState(app, accountKey);
    if (lastAuthStateRef.current.isSignedIn) syncClient.queuePush(accountKey);
  };
  const view = createPlannerView(ui);
  let currentStep = 1;
  const lastAuthStateRef = { current: { isConfigured: true, isSignedIn: false, isLoading: false, error: "", accountKey: "anon" } };
  const commitmentUi = createCommitmentTypeUi(ui);

  const refreshAvailabilityFromProfile = () => { week.availabilityRules = buildAvailabilityRulesFromProfile(week.profile); };
  const rerenderAll = () => {
    view.renderCommitments(week.profile.commitments);
    view.renderGoals(week.goals);
    view.renderHabits(week.habits);
    view.renderDraft(week.draft);
  };

  const applyUiFromState = () => {
    ui.wake.value = week.profile.wakeTime;
    ui.sleep.value = week.profile.sleepTime;
    ui.horizonDays.value = String(week.settings.horizonDays);
    ui.lockedHours.value = String(week.settings.lockedHorizonHours);
    ui.needBreakfast.value = String(week.profile.necessities.breakfast.durationMinutes);
    ui.needDinner.value = String(week.profile.necessities.dinner.durationMinutes);
    ui.needShower.value = String(week.profile.necessities.shower.durationMinutes);
  };

  const profileFromUi = () => ({
    wakeTime: normalizeTime(ui.wake.value, week.profile.wakeTime),
    sleepTime: normalizeTime(ui.sleep.value, week.profile.sleepTime),
    commitments: week.profile.commitments,
    necessities: {
      breakfast: { enabled: true, durationMinutes: Number(ui.needBreakfast.value) || 30 },
      dinner: { enabled: true, durationMinutes: Number(ui.needDinner.value) || 45 },
      shower: { enabled: true, durationMinutes: Number(ui.needShower.value) || 20 },
    },
  });

  const settingsFromUi = () => ({
    horizonDays: Math.max(1, Math.min(14, Number(ui.horizonDays.value) || 7)),
    lockedHorizonHours: Math.max(0, Math.min(48, Number(ui.lockedHours.value) || 12)),
  });

  const loadAccountState = (nextAccountKey) => {
    accountKey = nextAccountKey || "anon";
    app = loadPlannerState(accountKey);
    weekKey = rotateWeekIfNeeded(app, new Date());
    week = ensureWeekState(app, weekKey);
    if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
    applyUiFromState();
    commitmentUi.refresh();
    rerenderAll();
  };

  const syncClient = createPlannerSyncClient({
    onSyncStatus: (message, kind) => {
      if (!lastAuthStateRef.current.error && lastAuthStateRef.current.isSignedIn) view.setStatus(message, kind);
    },
    getAccessToken: (options) => writeClient.getAccessToken(options),
    loadLocalState: (nextAccountKey) => loadPlannerState(nextAccountKey),
    saveLocalState: (state, nextAccountKey) => savePlannerState(state, nextAccountKey),
    onRemoteStateApplied: (remoteState, nextAccountKey) => {
      if (nextAccountKey !== accountKey) return;
      app = remoteState;
      weekKey = rotateWeekIfNeeded(app, new Date());
      week = ensureWeekState(app, weekKey);
      if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
      applyUiFromState();
      rerenderAll();
    },
  });

  const writeClient = createCalendarWriteClient({
    onStateChange: async (state) => {
      lastAuthStateRef.current = state;
      applyGoogleConnectButtonState(ui.connect, state);
      applyGoogleConnectButtonState(ui.connectDrawer, state);
      ui.commit.disabled = !state.isSignedIn || state.isLoading;
      view.setPlannerLock(!state.isSignedIn);
      if (state.error) view.setStatus(state.error, "error");
      if (!state.error && state.isSignedIn) view.setStatus(`Planner ready for ${state.accountKey || "account"}.`, "success");
      if (state.isSignedIn && state.accountKey && state.accountKey !== accountKey) {
        loadAccountState(state.accountKey);
        save();
        view.setStatus(`Planner loaded for ${accountKey}.`, "success");
        if (syncClient.isEnabled()) await syncClient.bootstrap(accountKey);
      }
    },
  });

  const logic = createPlannerLogic({
    ui,
    week,
    weekKey,
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

  const onProfileChange = () => {
    week.profile = profileFromUi();
    week.settings = settingsFromUi();
    refreshAvailabilityFromProfile();
    save();
    rerenderAll();
  };

  ui.connect.addEventListener("click", async () => {
    if (lastAuthStateRef.current.isSignedIn) return view.setStatus("Google Calendar is already connected.", "success");
    try { await writeClient.connect(); view.setStatus("Google connected. Planner unlocked.", "success"); } catch (error) { writeClient.setError(error.message); }
  });
  ui.connectDrawer?.addEventListener("click", () => {
    ui.connect.click();
  });
  ui.prev.addEventListener("click", () => { currentStep = view.setStep(currentStep - 1); });
  ui.next.addEventListener("click", () => { currentStep = view.setStep(currentStep + 1); });
  ui.stepPills.forEach((pill) => pill.addEventListener("click", () => { currentStep = view.setStep(Number(pill.dataset.step)); }));
  [ui.wake, ui.sleep, ui.horizonDays, ui.lockedHours, ui.needBreakfast, ui.needDinner, ui.needShower].forEach((input) => input.addEventListener("change", onProfileChange));

  ui.addCommitment.addEventListener("click", () => {
    const mode = ui.commitmentType.value;
    const title = ui.commitmentTitle.value.trim() || "Commitment";
    const start = normalizeTime(ui.commitmentStart.value, "09:00");
    const end = normalizeTime(ui.commitmentEnd.value, "18:00");
    const date = dateOnly(ui.commitmentDay.value);
    const startDate = dateOnly(ui.commitmentStartDate.value);
    const endDate = dateOnly(ui.commitmentEndDate.value);
    const selectedDays = commitmentUi.getSelectedDays();
    const validation = validateCommitmentInput({
      mode,
      start,
      end,
      date,
      startDate,
      endDate,
      selectedDays,
      applicableDays: commitmentUi.getApplicableDays(),
    });
    if (!validation.ok) return view.setStatus(validation.message, "warning");
    week.profile.commitments.push(createCommitment({ mode, title, start, end, days: validation.days, startDate, endDate, date }));
    ui.commitmentTitle.value = "";
    if (mode === "one_off") ui.commitmentDay.value = "";
    onProfileChange();
    view.setStatus("Commitment added.", "success");
  });

  ui.addGoal.addEventListener("click", () => {
    const title = ui.goalTitle.value.trim();
    const deadline = dateOnly(ui.goalDeadline.value);
    const priority = Number(ui.goalPriority.value);
    const weeklyHours = Number(ui.goalHours.value);
    if (!title || !deadline || weeklyHours <= 0) return view.setStatus("Goal title, deadline, and weekly hours are required.", "warning");
    week.goals.push(createGoal({ title, deadlineIso: `${deadline}T23:59:59`, priority, weeklyHours }));
    ui.goalTitle.value = "";
    save();
    rerenderAll();
  });

  ui.addHabit.addEventListener("click", () => {
    const name = ui.habitName.value.trim();
    const frequency = Number(ui.habitFrequency.value);
    const durationMinutes = Number(ui.habitDuration.value);
    const window = ui.habitWindow.value;
    if (!name || frequency < 0 || durationMinutes < 15) return view.setStatus("Habit name, frequency, and duration are required.", "warning");
    week.habits.push(createHabit({ name, frequency, durationMinutes, window }));
    ui.habitName.value = "";
    save();
    rerenderAll();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const commitmentId = target.getAttribute("data-rm-commitment");
    const goalId = target.getAttribute("data-rm-goal");
    const habitId = target.getAttribute("data-rm-habit");
    if (commitmentId) week.profile.commitments = week.profile.commitments.filter((item) => item.id !== commitmentId);
    if (goalId) week.goals = week.goals.filter((item) => item.id !== goalId);
    if (habitId) week.habits = week.habits.filter((item) => item.id !== habitId);
    if (commitmentId || goalId || habitId) { save(); rerenderAll(); }
  });

  ui.generate.addEventListener("click", async () => {
    if (!lastAuthStateRef.current.isSignedIn) return view.setStatus("Connect Google first to plan.", "warning");
    const goal = week.goals[0] || null;
    const minorGoals = week.goals.map((item) => ({ id: item.id, title: item.title, targetHours: item.weeklyHours }));
    const tasks = [...week.tasks, ...logic.habitsAsTasks()];
    const horizonStart = new Date(); horizonStart.setHours(0, 0, 0, 0);
    const draft = generateDraftPlan({
      goal,
      minorGoals,
      tasks,
      availabilityRules: week.availabilityRules,
      horizonStart,
      horizonDays: week.settings.horizonDays,
      profile: week.profile,
      existingSlots: week.managedSlots,
      lockedHorizonHours: week.settings.lockedHorizonHours,
    });
    const end = new Date(horizonStart);
    end.setDate(end.getDate() + week.settings.horizonDays);
    let existingEvents = [];
    try {
      existingEvents = await writeClient.fetchExistingEvents({ startIso: horizonStart.toISOString(), endIso: end.toISOString() });
    } catch {}
    draft.preview = buildPlannerPreview({
      draftSlots: draft.slots,
      existingEvents,
      horizonStart,
      horizonDays: week.settings.horizonDays,
    });
    week.draft = draft;
    week.managedSlots = draft.slots.map((slot) => ({ ...slot, lifeosManaged: true, planRunId: `run_${Date.now().toString(36)}` }));
    if (draft.validation.ok) {
      draft.warnings = previewOverlapWarnings(draft.slots, existingEvents);
    }
    save();
    view.renderDraft(draft);
    if (!draft.validation.ok) return view.setStatus(draft.validation.errors.join(" "), "warning");
    if (!minorGoals.length && !tasks.length) {
      view.setStatus("Schedule generated with open hours. Add goals or habits when you are ready.", "neutral");
      currentStep = view.setStep(3);
      return;
    }
    view.setStatus(`Schedule generated (${draft.slots.length} slots).`, "success");
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

  if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
  applyUiFromState();
  commitmentUi.refresh();
  rerenderAll();
  aiBridge.hydrateSavedState(week.aiAssist);
  currentStep = view.setStep(1);
  view.setPlannerLock(true);
  view.setStatus("Connect Google to unlock account-scoped planning.", "neutral");
  save();
};
