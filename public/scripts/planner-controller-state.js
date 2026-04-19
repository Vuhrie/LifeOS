import {
  ensureWeekState,
  loadPlannerState,
  normalizeTime,
  rotateWeekIfNeeded,
} from "./planner-storage.js";

const defaultPlannerInputs = () => ({
  notes: "",
  changedSinceLastRun: "",
  taskProgressNotes: "",
  priorityMajorGoalId: "",
});

const defaultGoogleDecisionContext = () => ({
  lastCapturedAt: "",
  horizonStartIso: "",
  horizonEndIso: "",
  totalEvents: 0,
  externalEvents: 0,
  managedEvents: 0,
  dismissedEvents: 0,
});

export const ensurePlannerWeekFields = (week) => {
  if (!Array.isArray(week.aiMajorGoalSeeds)) week.aiMajorGoalSeeds = [];
  if (!Array.isArray(week.minorGoals)) week.minorGoals = [];
  if (!Array.isArray(week.tasks)) week.tasks = [];
  if (!week.aiPlannerInputs || typeof week.aiPlannerInputs !== "object") {
    week.aiPlannerInputs = defaultPlannerInputs();
  }
  if (!week.googleDecisionContext || typeof week.googleDecisionContext !== "object") {
    week.googleDecisionContext = defaultGoogleDecisionContext();
  }
  if (!Array.isArray(week.ignoredGoogleEventIds)) week.ignoredGoogleEventIds = [];
  if (!Array.isArray(week.dismissedGoogleCommitmentIds)) week.dismissedGoogleCommitmentIds = [];
  if (!week.importedEventEdits || typeof week.importedEventEdits !== "object") week.importedEventEdits = {};
  if (!week.majorGoalAiAssist || typeof week.majorGoalAiAssist !== "object") {
    week.majorGoalAiAssist = { lastPrompt: "", lastImportText: "", lastAppliedAt: "", lastApplySummary: "" };
  }
};

export const loadPlannerAccountState = ({ nextAccountKey, now = new Date() }) => {
  const accountKey = nextAccountKey || "anon";
  const app = loadPlannerState(accountKey);
  const weekKey = rotateWeekIfNeeded(app, now);
  const week = ensureWeekState(app, weekKey);
  ensurePlannerWeekFields(week);
  return { accountKey, app, weekKey, week };
};

export const setMajorGoalModeUi = ({ ui, mode }) => {
  const currentMode = mode === "manual" || mode === "ai_assisted" ? mode : "";
  ui.majorGoalModeButtons?.forEach((button) => {
    const selected = currentMode && button.dataset.majorGoalMode === currentMode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  if (ui.majorGoalManualFields) ui.majorGoalManualFields.hidden = currentMode !== "manual";
  if (ui.majorGoalAiFields) ui.majorGoalAiFields.hidden = currentMode !== "ai_assisted";
  return currentMode;
};

export const applyUiFromWeek = ({ ui, week }) => {
  ui.wake.value = week.profile.wakeTime;
  ui.sleep.value = week.profile.sleepTime;
  ui.horizonDays.value = String(week.settings.horizonDays);
  ui.lockedHours.value = String(week.settings.lockedHorizonHours);
  ui.needBreakfast.value = String(week.profile.necessities.breakfast.durationMinutes);
  ui.needDinner.value = String(week.profile.necessities.dinner.durationMinutes);
  ui.needMorningShower.value = String(week.profile.necessities.morningShower.durationMinutes);
  ui.needNightShower.value = String(week.profile.necessities.nightShower.durationMinutes);
  ui.aiChangedSince.value = week.aiPlannerInputs?.changedSinceLastRun || "";
  ui.aiTaskProgressNotes.value = week.aiPlannerInputs?.taskProgressNotes || "";
  ui.aiBriefNotes.value = week.aiPlannerInputs?.notes || "";
};

export const readProfileFromUi = ({ ui, week }) => ({
  wakeTime: normalizeTime(ui.wake.value, week.profile.wakeTime),
  sleepTime: normalizeTime(ui.sleep.value, week.profile.sleepTime),
  commitments: week.profile.commitments,
  necessities: {
    breakfast: { enabled: true, durationMinutes: Number(ui.needBreakfast.value) || 30 },
    dinner: { enabled: true, durationMinutes: Number(ui.needDinner.value) || 45 },
    morningShower: { enabled: true, durationMinutes: Number(ui.needMorningShower.value) || 20 },
    nightShower: { enabled: true, durationMinutes: Number(ui.needNightShower.value) || 20 },
  },
});

export const readSettingsFromUi = ({ ui }) => ({
  horizonDays: Math.max(1, Math.min(14, Number(ui.horizonDays.value) || 7)),
  lockedHorizonHours: Math.max(0, Math.min(48, Number(ui.lockedHours.value) || 12)),
});

export const runPlannerWeekCleanup = ({
  week,
  cleanupPlannerWeek,
  save,
  clearDraft,
  setStatus,
  shouldSave = true,
  announce = false,
}) => {
  const result = cleanupPlannerWeek(week);
  if (!result.changed) return result;
  clearDraft();
  if (shouldSave) save();
  if (announce) {
    const parts = [
      result.removedMinorGoals ? `${result.removedMinorGoals} orphan minor goal(s)` : "",
      result.removedTasks ? `${result.removedTasks} orphan task(s)` : "",
    ].filter(Boolean);
    setStatus(`Cleaned stale AI planning data: ${parts.join(", ")}.`, "warning");
  }
  return result;
};
