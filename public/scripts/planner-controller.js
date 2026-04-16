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

const hmOf = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "09:00";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
};

const withHm = (dateLike, hhmm) => {
  const [rawHour, rawMinute] = String(hhmm || "").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  date.setHours(hour, minute, 0, 0);
  return date;
};

const toLocalDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toHHMM = (value, fallback = "09:00") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
};

const tomorrowStart = () => {
  const next = new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
};

const filterIgnoredEvents = (events, ignoredIds) =>
  (events || []).filter((event) => !ignoredIds.includes(String(event.id || "")));

const applyImportedEventEdits = (events, edits) =>
  (events || []).map((event) => {
    const patch = edits?.[String(event.id || "")];
    return patch ? { ...event, ...patch } : event;
  });

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
  let latestImportedEventsById = new Map();
  let logic = null;
  let currentStep = 1;
  const lastAuthStateRef = { current: { isConfigured: true, isSignedIn: false, isLoading: false, error: "", accountKey: "anon" } };
  const commitmentUi = createCommitmentTypeUi(ui);

  const refreshAvailabilityFromProfile = () => { week.availabilityRules = buildAvailabilityRulesFromProfile(week.profile); };
  const rerenderAll = () => {
    view.renderCommitments(week.profile.commitments);
    view.renderGoals(week.goals);
    view.renderMinorGoals(week.minorGoals, week.goals);
    view.renderTasks(week.tasks, week.minorGoals);
    view.renderHabits(week.habits);
    view.renderPriorityMajorGoalOptions(week.goals, week.aiPlannerInputs?.priorityMajorGoalId || "");
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
    ui.aiChangedSince.value = week.aiPlannerInputs?.changedSinceLastRun || "";
    ui.aiTaskProgressNotes.value = week.aiPlannerInputs?.taskProgressNotes || "";
    ui.aiBriefNotes.value = week.aiPlannerInputs?.notes || "";
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
    if (!Array.isArray(week.minorGoals)) week.minorGoals = [];
    if (!Array.isArray(week.tasks)) week.tasks = [];
    if (!week.aiPlannerInputs || typeof week.aiPlannerInputs !== "object") {
      week.aiPlannerInputs = { notes: "", changedSinceLastRun: "", taskProgressNotes: "", priorityMajorGoalId: "" };
    }
    if (!Array.isArray(week.ignoredGoogleEventIds)) week.ignoredGoogleEventIds = [];
    if (!Array.isArray(week.dismissedGoogleCommitmentIds)) week.dismissedGoogleCommitmentIds = [];
    if (!week.importedEventEdits || typeof week.importedEventEdits !== "object") week.importedEventEdits = {};
    latestImportedEventsById = new Map();
    if (!week.availabilityRules?.length) refreshAvailabilityFromProfile();
    applyUiFromState();
    commitmentUi.refresh();
    rerenderAll();
    if (logic) {
      logic = createPlannerLogic({
        week,
        weekKey,
        save,
        rerenderAll,
        refreshAvailabilityFromProfile,
        applyUiFromState,
        writeClient,
        lastAuthStateRef,
      });
    }
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

  const rebuildDraftPreview = () => {
    if (!week.draft) return;
    const horizonStart = new Date(week.draft.horizonStartIso || Date.now());
    horizonStart.setHours(0, 0, 0, 0);
    const horizonDays = Number(week.draft.horizonDays || week.settings.horizonDays || 7);
    const visibleImported = filterIgnoredEvents(week.draft.importedEvents || [], week.ignoredGoogleEventIds);
    const editedImported = applyImportedEventEdits(visibleImported, week.importedEventEdits);
    latestImportedEventsById = new Map(editedImported.map((item) => [String(item.id), item]));
    week.draft.preview = buildPlannerPreview({
      draftSlots: week.draft.slots || [],
      existingEvents: editedImported,
      horizonStart,
      horizonDays,
      commitments: week.profile.commitments,
    });
    week.draft.warnings = previewOverlapWarnings(week.draft.slots || [], editedImported);
  };

  const syncImportedGoogleCommitments = async ({
    startIso,
    endIso,
    silent = true,
  } = {}) => {
    if (!lastAuthStateRef.current.isSignedIn) return;
    let events = [];
    try {
      events = await writeClient.fetchExistingEvents({
        startIso: startIso || tomorrowStart().toISOString(),
        endIso: endIso || new Date(tomorrowStart().getTime() + 14 * 86400000).toISOString(),
      });
    } catch (error) {
      if (!silent) view.setStatus(`Google import failed: ${error.message}`, "error");
      return;
    }
    const existingIds = new Set(
      (week.profile.commitments || [])
        .map((item) => String(item.googleEventId || ""))
        .filter(Boolean),
    );
    const dismissedIds = new Set(
      (week.dismissedGoogleCommitmentIds || []).map((item) => String(item || "")).filter(Boolean),
    );
    let changedDismissed = false;
    existingIds.forEach((eventId) => {
      if (!dismissedIds.has(eventId)) return;
      dismissedIds.delete(eventId);
      changedDismissed = true;
    });
    const newCommitments = [];
    events.forEach((event) => {
      const eventId = String(event.id || "");
      if (!eventId || existingIds.has(eventId) || dismissedIds.has(eventId)) return;
      const start = event.start || "";
      const end = event.end || event.start || "";
      newCommitments.push(createCommitment({
        mode: "one_off",
        title: String(event.title || "Imported commitment"),
        start: toHHMM(start, "09:00"),
        end: toHHMM(end, "10:00"),
        date: toLocalDate(start),
        source: "google_imported",
        googleEventId: eventId,
      }));
    });
    if (changedDismissed) {
      week.dismissedGoogleCommitmentIds = [...dismissedIds];
    }
    if (!newCommitments.length) {
      if (changedDismissed) save();
      if (!silent) view.setStatus("Google commitments already synced.", "neutral");
      return;
    }
    week.profile.commitments = [...week.profile.commitments, ...newCommitments];
    save();
    rerenderAll();
    if (!silent) view.setStatus(`Imported ${newCommitments.length} Google events into commitments.`, "success");
  };

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
      if (state.isSignedIn) await syncImportedGoogleCommitments({ silent: true });
    },
  });

  logic = createPlannerLogic({
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
    onBuildPrompt: async () => {
      await syncImportedGoogleCommitments({ silent: true });
      return logic.buildPromptContext();
    },
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
  [ui.aiChangedSince, ui.aiTaskProgressNotes, ui.aiBriefNotes, ui.aiPriorityMajorGoal].forEach((input) => {
    input?.addEventListener("change", onPlannerBriefChange);
    input?.addEventListener("input", onPlannerBriefChange);
  });

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
    week.profile.commitments.push(createCommitment({
      mode,
      title,
      start,
      end,
      days: validation.days,
      startDate,
      endDate,
      date,
      source: "manual",
    }));
    ui.commitmentTitle.value = "";
    if (mode === "one_off") ui.commitmentDay.value = "";
    onProfileChange();
    view.setStatus("Commitment added.", "success");
  });

  ui.addGoal.addEventListener("click", () => {
    const title = ui.goalTitle.value.trim();
    const deadline = dateOnly(ui.goalDeadline.value);
    const priority = Number(ui.goalPriority.value);
    const weeklyHours = Math.max(1, Number(ui.goalHours.value) || 8);
    if (!title) return view.setStatus("Major goal title is required.", "warning");
    week.goals.push(createGoal({
      title,
      deadlineIso: deadline ? `${deadline}T23:59:59` : "",
      priority,
      weeklyHours,
      deadlineSource: deadline ? "manual" : "ai_assessed_pending",
    }));
    ui.goalTitle.value = "";
    ui.goalDeadline.value = "";
    save();
    rerenderAll();
    view.setStatus(deadline ? "Major goal added." : "Major goal added. AI may propose a deadline.", "success");
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
    const editCommitmentId = target.getAttribute("data-edit-commitment");
    const goalId = target.getAttribute("data-rm-goal");
    const habitId = target.getAttribute("data-rm-habit");
    const editImportedEventId = target.getAttribute("data-edit-imported");
    const importedEventId = target.getAttribute("data-rm-imported");
    if (editCommitmentId) {
      const commitment = week.profile.commitments.find((item) => item.id === editCommitmentId);
      if (!commitment) return;
      const nextTitle = window.prompt("Commitment title", commitment.title || "");
      if (nextTitle === null) return;
      const nextStart = window.prompt("Start time (HH:MM)", commitment.start || "09:00");
      if (nextStart === null) return;
      const nextEnd = window.prompt("End time (HH:MM)", commitment.end || "18:00");
      if (nextEnd === null) return;
      commitment.title = nextTitle.trim() || commitment.title;
      commitment.start = normalizeTime(nextStart, commitment.start || "09:00");
      commitment.end = normalizeTime(nextEnd, commitment.end || "18:00");
      if (commitment.mode === "one_off") {
        const nextDate = window.prompt("Date (YYYY-MM-DD)", commitment.date || "");
        if (nextDate !== null) commitment.date = dateOnly(nextDate) || commitment.date;
      }
      save();
      rerenderAll();
      view.setStatus("Commitment updated.", "success");
      return;
    }
    if (editImportedEventId) {
      const editableEvent = latestImportedEventsById.get(editImportedEventId);
      if (!editableEvent) {
        view.setStatus("Imported event could not be found in the current draft.", "warning");
        return;
      }
      const shouldEdit = window.confirm(
        "This event is imported from Google Calendar. Continue editing it from LifeOS?",
      );
      if (!shouldEdit) return;
      const nextTitle = window.prompt("Event title", String(editableEvent.title || "").trim());
      if (nextTitle === null) return;
      const nextStartHm = window.prompt("Start time (HH:MM, 24-hour)", hmOf(editableEvent.start));
      if (nextStartHm === null) return;
      const nextEndHm = window.prompt("End time (HH:MM, 24-hour)", hmOf(editableEvent.end));
      if (nextEndHm === null) return;
      const startDate = withHm(editableEvent.start, nextStartHm);
      const endDate = withHm(editableEvent.end, nextEndHm);
      if (!startDate || !endDate || endDate <= startDate) {
        view.setStatus("Invalid imported event time range.", "warning");
        return;
      }
      week.importedEventEdits[editImportedEventId] = {
        title: String(nextTitle || editableEvent.title || "Imported event"),
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        description: String(editableEvent.description || ""),
      };
      week.ignoredGoogleEventIds = week.ignoredGoogleEventIds.filter((id) => id !== editImportedEventId);
      rebuildDraftPreview();
      save();
      view.renderDraft(week.draft);
      view.setStatus("Imported event updated in planner draft. Commit to apply to Google.", "warning");
      return;
    }
    if (importedEventId) {
      const shouldRemove = window.confirm(
        "This event is imported from Google Calendar. Remove it from your LifeOS plan and delete it from Google when you commit?",
      );
      if (!shouldRemove) return;
      if (!week.ignoredGoogleEventIds.includes(importedEventId)) {
        week.ignoredGoogleEventIds.push(importedEventId);
      }
      delete week.importedEventEdits[importedEventId];
      rebuildDraftPreview();
      save();
      view.renderDraft(week.draft);
      view.setStatus("Imported event removed from planner draft. Commit to apply to Google.", "warning");
      return;
    }
    if (commitmentId) {
      const commitment = week.profile.commitments.find((item) => item.id === commitmentId);
      if (commitment?.source === "google_imported" && commitment.googleEventId) {
        const dismissed = new Set(week.dismissedGoogleCommitmentIds || []);
        dismissed.add(String(commitment.googleEventId));
        week.dismissedGoogleCommitmentIds = [...dismissed];
      }
      week.profile.commitments = week.profile.commitments.filter((item) => item.id !== commitmentId);
    }
    if (goalId) {
      week.goals = week.goals.filter((item) => item.id !== goalId);
      const removedMinorIds = week.minorGoals.filter((item) => item.majorGoalId === goalId).map((item) => item.id);
      week.minorGoals = week.minorGoals.filter((item) => item.majorGoalId !== goalId);
      week.tasks = week.tasks.filter((item) => !removedMinorIds.includes(item.minorGoalId));
    }
    if (habitId) week.habits = week.habits.filter((item) => item.id !== habitId);
    if (commitmentId || goalId || habitId) { save(); rerenderAll(); }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const taskId = target.getAttribute("data-task-status");
    if (!taskId) return;
    const task = week.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.status = target.value;
    task.updatedAt = new Date().toISOString();
    save();
    rerenderAll();
    view.setStatus("Task progress updated for AI planning context.", "success");
  });

  ui.generate.addEventListener("click", async () => {
    if (!lastAuthStateRef.current.isSignedIn) return view.setStatus("Connect Google first to plan.", "warning");
    await syncImportedGoogleCommitments({ silent: true });
    const goal = week.goals[0] || null;
    const minorGoals = week.minorGoals.map((item) => ({
      id: item.id,
      title: item.title,
      targetHours: 2,
    }));
    const tasks = [...week.tasks, ...logic.habitsAsTasks()];
    const horizonStart = tomorrowStart();
    const horizonDays = 7;
    const draft = generateDraftPlan({
      goal,
      minorGoals,
      tasks,
      availabilityRules: week.availabilityRules,
      horizonStart,
      horizonDays,
      profile: week.profile,
      existingSlots: week.managedSlots,
      lockedHorizonHours: week.settings.lockedHorizonHours,
    });
    const end = new Date(horizonStart);
    end.setDate(end.getDate() + horizonDays);
    let existingEvents = [];
    try {
      existingEvents = await writeClient.fetchExistingEvents({ startIso: horizonStart.toISOString(), endIso: end.toISOString() });
    } catch {}
    const visibleExistingEvents = filterIgnoredEvents(existingEvents, week.ignoredGoogleEventIds);
    const editedExistingEvents = applyImportedEventEdits(visibleExistingEvents, week.importedEventEdits);
    latestImportedEventsById = new Map(editedExistingEvents.map((item) => [String(item.id), item]));
    draft.importedEvents = visibleExistingEvents;
    draft.horizonStartIso = horizonStart.toISOString();
    draft.horizonDays = horizonDays;
    draft.preview = buildPlannerPreview({
      draftSlots: draft.slots,
      existingEvents: editedExistingEvents,
      horizonStart,
      horizonDays,
      commitments: week.profile.commitments,
    });
    week.draft = draft;
    week.managedSlots = draft.slots.map((slot) => ({ ...slot, lifeosManaged: true, planRunId: `run_${Date.now().toString(36)}` }));
    if (draft.validation.ok) {
      draft.warnings = previewOverlapWarnings(draft.slots, editedExistingEvents);
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
    const hasSlots = Boolean(week.draft?.slots?.length);
    const hasDeletes = Boolean(week.ignoredGoogleEventIds?.length);
    const updateEvents = Object.entries(week.importedEventEdits || {})
      .filter(([eventId]) => !week.ignoredGoogleEventIds.includes(eventId))
      .map(([eventId, value]) => ({ id: eventId, ...value }));
    const hasUpdates = Boolean(updateEvents.length);
    if (!hasSlots && !hasDeletes && !hasUpdates) return view.setStatus("Generate a draft before committing.", "warning");
    try {
      const deleteEventIds = [...new Set(week.ignoredGoogleEventIds)];
      const result = await writeClient.commitDraft(week.draft?.slots || [], {
        deleteEventIds,
        updateEvents,
      });
      week.commitLog.push({
        commitId: result.commitId,
        timestamp: new Date().toISOString(),
        writes: result.writes,
        deletes: result.deletes,
        updates: result.updates,
        warningCount: week.draft.warnings.length,
      });
      week.ignoredGoogleEventIds = [];
      week.importedEventEdits = {};
      save();
      view.setStatus(
        `Committed ${result.writes.length} planned events, updated ${result.updates.length}, and removed ${result.deletes.length} imported events.`,
        "success",
      );
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
