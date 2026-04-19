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
  loadPlannerState,
  normalizeTime,
  rotateWeekIfNeeded,
  savePlannerState,
} from "./planner-storage.js";
import { createPlannerView } from "./planner-view.js";
import { createCommitmentTypeUi } from "./planner-commitment-ui.js";
import { validateCommitmentInput } from "./planner-validation.js";
import { cleanupPlannerWeek } from "./planner-state-cleanup.js";
import { createGoogleCommitmentSync } from "./planner-controller-google-sync.js";
import { createMajorGoalAiController } from "./planner-controller-major-goals.js";
import {
  createPlannerSyncController,
  createPlannerWriteController,
  registerGoogleConnectEvents,
} from "./planner-controller-auth-sync.js";
import { registerPlannerUiEvents } from "./planner-controller-ui-events.js";
import { registerScheduleActions } from "./planner-controller-schedule-actions.js";
import {
  applyUiFromWeek,
  loadPlannerAccountState,
  readProfileFromUi,
  readSettingsFromUi,
  runPlannerWeekCleanup,
  setMajorGoalModeUi,
} from "./planner-controller-state.js";
import {
  applyImportedEventEdits,
  filterHiddenGoogleEvents,
  rebuildSessionDraftPreview,
} from "./planner-controller-helpers.js";
export const initPlannerController = (ui) => {
  let accountKey = "anon";
  let app = loadPlannerState(accountKey), weekKey = rotateWeekIfNeeded(app, new Date());
  let week = ensureWeekState(app, weekKey);
  let sessionDraft = null;
  const persistableState = () => {
    const cloned = JSON.parse(JSON.stringify(app));
    Object.values(cloned.weeks || {}).forEach((value) => {
      if (!value || typeof value !== "object") return;
      delete value.draft;
    });
    return cloned;
  };
  const save = () => {
    savePlannerState(persistableState(), accountKey);
    if (lastAuthStateRef.current.isSignedIn) syncClient.queuePush(accountKey);
  };
  const view = createPlannerView(ui);
  let latestImportedEventsById = new Map(), logic = null, majorGoalAiUi = null, writeClientRef = null;
  let currentStep = 1, allowPageExit = false, leaveGuardBusy = false, majorGoalMode = "";
  const lastAuthStateRef = { current: { isConfigured: true, isSignedIn: false, isLoading: false, error: "", accountKey: "anon" } };
  const commitmentUi = createCommitmentTypeUi(ui);
  const refreshAvailabilityFromProfile = () => { week.availabilityRules = buildAvailabilityRulesFromProfile(week.profile); };
  const rerenderAll = () => {
    view.renderCommitments(week.profile.commitments);
    view.renderGoals({
      goals: week.goals,
      aiGoalSeeds: week.aiMajorGoalSeeds || [],
    });
    view.renderMinorGoals(week.minorGoals, week.goals);
    view.renderTasks(week.tasks, week.minorGoals);
    view.renderHabits(week.habits);
    view.renderPriorityMajorGoalOptions(week.goals, week.aiPlannerInputs?.priorityMajorGoalId || "");
    view.renderDraft(sessionDraft);
    view.renderDecisionSnapshot({ snapshot: week.googleDecisionContext, commitLog: week.commitLog });
  };
  const hasDraftPreview = () => Boolean(sessionDraft?.preview?.days?.length);
  const clearDraftOnly = () => {
    sessionDraft = null;
    view.renderDraft(null);
    view.resetCommitProgress();
  };
  const rebuildPlannerLogic = (writeClientInstance) => {
    logic = createPlannerLogic({
      week,
      weekKey,
      save,
      rerenderAll,
      refreshAvailabilityFromProfile,
      applyUiFromState,
      writeClient: writeClientInstance,
      lastAuthStateRef,
      onGoogleContextCaptured: (snapshot) => {
        week.googleDecisionContext = { ...week.googleDecisionContext, ...snapshot };
        save();
        rerenderAll();
      },
    });
  };
  const runStateCleanup = ({ shouldSave = true, announce = false } = {}) =>
    runPlannerWeekCleanup({
      week,
      cleanupPlannerWeek,
      save,
      clearDraft: () => {
        sessionDraft = null;
        view.resetCommitProgress();
      },
      setStatus: (message, kind) => view.setStatus(message, kind),
      shouldSave,
      announce,
    });
  const setMajorGoalMode = (mode) => { majorGoalMode = setMajorGoalModeUi({ ui, mode }); };
  const applyUiFromState = () => { applyUiFromWeek({ ui, week }); };
  const profileFromUi = () => readProfileFromUi({ ui, week });
  const settingsFromUi = () => readSettingsFromUi({ ui });
  const loadAccountState = (nextAccountKey) => {
    const loaded = loadPlannerAccountState({ nextAccountKey, now: new Date() });
    accountKey = loaded.accountKey;
    app = loaded.app;
    weekKey = loaded.weekKey;
    week = loaded.week;
    sessionDraft = null;
    runStateCleanup({ announce: true });
    latestImportedEventsById = new Map();
    if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
    applyUiFromState();
    setMajorGoalMode("");
    commitmentUi.refresh();
    rerenderAll();
    majorGoalAiUi?.hydrateSavedState(week.majorGoalAiAssist);
    if (writeClientRef) rebuildPlannerLogic(writeClientRef);
  };
  const syncClient = createPlannerSyncController({
    view,
    lastAuthStateRef,
    getWriteClient: () => writeClient,
    loadLocalState: (nextAccountKey) => loadPlannerState(nextAccountKey),
    saveLocalState: (state, nextAccountKey) => savePlannerState(state, nextAccountKey),
    onRemoteStateApplied: (remoteState, nextAccountKey) => {
      if (nextAccountKey !== accountKey) return;
      app = remoteState;
      weekKey = rotateWeekIfNeeded(app, new Date());
      week = ensureWeekState(app, weekKey);
      sessionDraft = null;
      runStateCleanup({ announce: true });
      if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
      applyUiFromState();
      rerenderAll();
      majorGoalAiUi?.hydrateSavedState(week.majorGoalAiAssist);
      if (writeClientRef) rebuildPlannerLogic(writeClientRef);
    },
  });
  const rebuildDraftPreview = () => {
    if (!sessionDraft) return;
    const nextPreview = rebuildSessionDraftPreview({
      sessionDraft,
      week,
      buildPlannerPreview,
      previewOverlapWarnings,
      filterHiddenGoogleEvents,
      applyImportedEventEdits,
    });
    latestImportedEventsById = new Map(nextPreview.editedImported.map((item) => [String(item.id), item]));
    sessionDraft.preview = nextPreview.preview;
    sessionDraft.warnings = nextPreview.warnings;
  };
  const syncImportedGoogleCommitments = createGoogleCommitmentSync({
    writeClient,
    lastAuthStateRef,
    getWeek: () => week,
    save,
    rerenderAll,
    view,
    createCommitment,
  });
  const writeClient = createPlannerWriteController({
    ui,
    view,
    lastAuthStateRef,
    getAccountKey: () => accountKey,
    loadAccountState,
    save,
    syncClient,
    syncImportedGoogleCommitments,
  });
  writeClientRef = writeClient;
  rebuildPlannerLogic(writeClientRef);
  const aiBridge = createAiBridgeUi({
    output: ui.aiPromptOutput,
    importInput: ui.aiImportInput,
    status: ui.aiStatus,
    buildButton: ui.aiBuildPrompt,
    copyButton: ui.aiCopyPrompt,
    validateButton: ui.aiValidateImport,
    applyButton: ui.aiApplyImport,
    clearButton: ui.aiClearImport,
    onBuildPrompt: async () => {
      await syncImportedGoogleCommitments({ silent: true });
      return logic.buildPromptContext();
    },
    onValidateImport: (text) => parseAiBridgePlan(text),
    onApplyImport: (plan) => {
      const summary = logic.applyAiOperations(plan, summarizeAiBridgePlan);
      sessionDraft = null;
      view.renderDraft(null);
      view.resetCommitProgress();
      return summary;
    },
    onPersist: (next) => { week.aiAssist = { ...week.aiAssist, ...next }; save(); },
  });
  ({ majorGoalAiUi } = createMajorGoalAiController({
    ui,
    view,
    getWeek: () => week,
    save,
    rerenderAll,
  }));
  const onProfileChange = () => {
    week.profile = profileFromUi();
    week.settings = settingsFromUi();
    refreshAvailabilityFromProfile();
    save();
    rerenderAll();
  };
  const onPlannerBriefChange = () => {
    week.aiPlannerInputs = {
      ...week.aiPlannerInputs,
      changedSinceLastRun: ui.aiChangedSince.value.trim(),
      taskProgressNotes: ui.aiTaskProgressNotes.value.trim(),
      notes: ui.aiBriefNotes.value.trim(),
      priorityMajorGoalId: ui.aiPriorityMajorGoal.value || "",
    };
    save();
  };
  registerGoogleConnectEvents({ ui, view, writeClient, lastAuthStateRef });
  registerPlannerUiEvents({
    ui,
    view,
    commitmentUi,
    normalizeTime,
    validateCommitmentInput,
    createCommitment,
    createGoal,
    createHabit,
    cleanupPlannerWeek,
    save,
    rerenderAll,
    onProfileChange,
    onPlannerBriefChange,
    setMajorGoalMode,
    getMajorGoalMode: () => majorGoalMode,
    getWeek: () => week,
    getLatestImportedEventsById: () => latestImportedEventsById,
    getSessionDraft: () => sessionDraft,
    rebuildDraftPreview,
    setCurrentStep: (update) => {
      currentStep = typeof update === "function" ? update(currentStep) : update;
    },
  });
  registerScheduleActions({
    ui,
    view,
    writeClient,
    generateDraftPlan,
    buildPlannerPreview,
    previewOverlapWarnings,
    save,
    rerenderAll,
    getWeek: () => week,
    getCurrentStep: () => currentStep,
    setCurrentStep: (next) => { currentStep = next; },
    getSessionDraft: () => sessionDraft,
    setSessionDraft: (value) => { sessionDraft = value; },
    clearDraftOnly,
    hasDraftPreview,
    getAllowPageExit: () => allowPageExit,
    setAllowPageExit: (value) => { allowPageExit = value; },
    getLeaveGuardBusy: () => leaveGuardBusy,
    setLeaveGuardBusy: (value) => { leaveGuardBusy = value; },
    setLatestImportedEventsById: (value) => { latestImportedEventsById = value; },
  });
  runStateCleanup({ shouldSave: false });
  if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
  applyUiFromState();
  setMajorGoalMode("");
  commitmentUi.refresh();
  rerenderAll();
  aiBridge.hydrateSavedState(week.aiAssist);
  majorGoalAiUi.hydrateSavedState(week.majorGoalAiAssist);
  view.resetCommitProgress();
  currentStep = view.setStep(1);
  view.setPlannerLock(true);
  view.setStatus("Connect Google to unlock account-scoped planning.", "neutral");
  save();
};
