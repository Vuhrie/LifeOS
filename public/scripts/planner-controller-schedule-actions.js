import {
  buildDeterministicHabitTasks,
  buildDraftFromSlots,
  collectCommitItemsFromDraft,
  formatDateLabel,
  inHorizonWindow,
  tomorrowStart,
} from "./planner-controller-helpers.js";

export const registerScheduleActions = ({
  ui,
  view,
  writeClient,
  generateDraftPlan,
  buildPlannerPreview,
  previewOverlapWarnings,
  save,
  rerenderAll,
  getWeek,
  getCurrentStep,
  setCurrentStep,
  getSessionDraft,
  setSessionDraft,
  clearDraftOnly,
  hasDraftPreview,
  getAllowPageExit,
  setAllowPageExit,
  getLeaveGuardBusy,
  setLeaveGuardBusy,
  setLatestImportedEventsById,
}) => {
  const commitDraftToCalendar = async () => {
    const week = getWeek();
    const sessionDraft = getSessionDraft();
    if (getCurrentStep() !== 3) {
      view.setStatus("Commit is available only in Step 3 (Rolling 7-Day Plan).", "warning");
      return false;
    }
    if (!sessionDraft?.preview?.days?.length) {
      view.setStatus("Generate a draft before committing.", "warning");
      return false;
    }
    const horizonStart = new Date(sessionDraft.horizonStartIso || tomorrowStart());
    horizonStart.setHours(0, 0, 0, 0);
    const horizonDays = Number(sessionDraft.horizonDays || week.settings.horizonDays || 7);
    const horizonEnd = new Date(horizonStart);
    horizonEnd.setDate(horizonStart.getDate() + horizonDays);
    const commitItems = collectCommitItemsFromDraft(sessionDraft);
    if (!commitItems.length) return view.setStatus("No schedule items available to commit in this rolling window.", "warning");
    const firstConfirm = window.confirm(`Replace Google Calendar events from ${formatDateLabel(horizonStart)} to ${formatDateLabel(horizonEnd)} with ${commitItems.length} LifeOS items?`);
    if (!firstConfirm) return view.setStatus("Commit canceled before replacement started.", "neutral");
    const secondConfirm = window.prompt("Type REPLACE to confirm calendar replacement.");
    if (String(secondConfirm || "").trim().toUpperCase() !== "REPLACE") {
      view.setStatus("Second confirmation failed. Commit canceled.", "warning");
      return false;
    }
    const pendingCommit = {
      commitId: `commit_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      status: "running",
      startIso: horizonStart.toISOString(),
      endIso: horizonEnd.toISOString(),
      targetCount: commitItems.length,
      existingCount: null,
      writes: [],
      deletes: [],
      failed: [],
    };
    week.commitLog.push(pendingCommit);
    save();
    rerenderAll();
    view.showCommitProgress();
    view.updateCommitProgress({ phase: "Preparing", percent: 2, current: "Starting rolling 7-day replacement.", deleted: 0, added: 0, failed: 0 });
    try {
      const result = await writeClient.commitRollingWindow({
        startIso: horizonStart.toISOString(),
        endIso: horizonEnd.toISOString(),
        items: commitItems,
        onProgress: (update) => {
          view.updateCommitProgress(update);
          if (update.current) view.appendCommitProgressLog(update.current);
        },
      });
      pendingCommit.commitId = result.commitId;
      pendingCommit.writes = result.writes;
      pendingCommit.deletes = result.deletes;
      pendingCommit.failed = result.failed;
      pendingCommit.targetCount = result.targetCount;
      pendingCommit.existingCount = result.existingCount;
      pendingCommit.finishedAt = new Date().toISOString();
      pendingCommit.status = result.failed.length ? "partial" : "succeeded";
      week.ignoredGoogleEventIds = [];
      week.importedEventEdits = {};
      setSessionDraft(null);
      save();
      view.renderDraft(null);
      view.appendCommitProgressLog(`Done: deleted ${result.deletes.length}, added ${result.writes.length}, failed ${result.failed.length}.`);
      view.setStatus(
        `Committed rolling 7-day schedule. Deleted ${result.deletes.length}, added ${result.writes.length}, failed ${result.failed.length}.`,
        result.failed.length ? "warning" : "success",
      );
      return true;
    } catch (error) {
      const latest = week.commitLog[week.commitLog.length - 1];
      if (latest) {
        latest.status = "failed";
        latest.finishedAt = new Date().toISOString();
        latest.failed = [...(latest.failed || []), { stage: "commit", error: error.message }];
      }
      save();
      rerenderAll();
      view.appendCommitProgressLog(`Commit failed: ${error.message}`);
      view.setStatus(`Commit failed: ${error.message}`, "error");
      return false;
    }
  };

  const resolveDraftExitAction = async () => {
    if (!hasDraftPreview()) return "proceed";
    if (getLeaveGuardBusy()) return "stay";
    setLeaveGuardBusy(true);
    try {
      const input = window.prompt("A temporary draft exists. Type COMMIT to send it to Google Calendar, DISCARD to delete it and leave, or CANCEL to stay.");
      const action = String(input || "").trim().toUpperCase();
      if (action === "DISCARD") {
        clearDraftOnly();
        view.setStatus("Draft discarded. Leaving planner.", "neutral");
        return "proceed";
      }
      if (action === "COMMIT") {
        setCurrentStep(view.setStep(3));
        const ok = await commitDraftToCalendar();
        return ok ? "proceed" : "stay";
      }
      view.setStatus("Stayed on planner. Draft unchanged.", "neutral");
      return "stay";
    } finally {
      setLeaveGuardBusy(false);
    }
  };

  ui.generate.addEventListener("click", async () => {
    const week = getWeek();
    if (!writeClient.getState().isSignedIn) return view.setStatus("Connect Google first to plan.", "warning");
    const hasAiGoalSeeds = Boolean((week.aiMajorGoalSeeds || []).length);
    const planningCommitments = (week.profile.commitments || []).filter((item) => String(item?.source || "") !== "google_imported");
    const planningProfile = { ...week.profile, commitments: planningCommitments };
    const goal = week.goals[0] || null;
    const minorGoals = week.minorGoals.map((item) => ({ id: item.id, title: item.title, targetHours: Math.max(1, Number(item.targetHours || 1)) }));
    const horizonStart = tomorrowStart();
    const horizonDays = 7;
    const horizonEnd = new Date(horizonStart);
    horizonEnd.setDate(horizonStart.getDate() + horizonDays);
    const persistedAiSlots = (week.managedSlots || []).filter((slot) => slot && slot.persistedFromAiApply === true).filter((slot) => inHorizonWindow(slot.start, horizonStart, horizonEnd));
    if (persistedAiSlots.length) {
      const draftFromAi = buildDraftFromSlots({ slots: persistedAiSlots, horizonStart, horizonDays });
      setLatestImportedEventsById(new Map());
      draftFromAi.importedEvents = [];
      draftFromAi.horizonStartIso = horizonStart.toISOString();
      draftFromAi.horizonDays = horizonDays;
      draftFromAi.preview = buildPlannerPreview({ draftSlots: draftFromAi.slots, existingEvents: [], horizonStart, horizonDays, commitments: planningCommitments, profile: planningProfile });
      draftFromAi.warnings = previewOverlapWarnings(draftFromAi.slots, []);
      setSessionDraft(draftFromAi);
      week.managedSlots = draftFromAi.slots.map((slot) => ({ ...slot, lifeosManaged: true, persistedFromAiApply: true, planRunId: `run_${Date.now().toString(36)}` }));
      save();
      view.renderDraft(draftFromAi);
      view.resetCommitProgress();
      view.setStatus(`Schedule generated from applied AI plan (${draftFromAi.slots.length} slots).`, "success");
      setCurrentStep(view.setStep(3));
      return;
    }
    const habitTasks = buildDeterministicHabitTasks({ habits: week.habits, horizonStart, horizonDays });
    const nonHabitTasks = (week.tasks || []).filter((task) => !String(task?.habitId || ""));
    const tasks = [...nonHabitTasks, ...habitTasks];
    const nonHabitManagedSlots = (week.managedSlots || []).filter((slot) => String(slot?.type || "") !== "habit");
    const draft = generateDraftPlan({
      goal,
      minorGoals,
      tasks,
      availabilityRules: week.availabilityRules,
      horizonStart,
      horizonDays,
      profile: planningProfile,
      existingSlots: nonHabitManagedSlots,
      lockedHorizonHours: week.settings.lockedHorizonHours,
    });
    setLatestImportedEventsById(new Map());
    draft.importedEvents = [];
    draft.horizonStartIso = horizonStart.toISOString();
    draft.horizonDays = horizonDays;
    draft.preview = buildPlannerPreview({ draftSlots: draft.slots, existingEvents: [], horizonStart, horizonDays, commitments: planningCommitments, profile: planningProfile });
    setSessionDraft(draft);
    week.managedSlots = draft.slots.map((slot) => ({ ...slot, lifeosManaged: true, persistedFromAiApply: Boolean(slot.persistedFromAiApply), planRunId: `run_${Date.now().toString(36)}` }));
    if (draft.validation.ok) draft.warnings = previewOverlapWarnings(draft.slots, []);
    save();
    view.renderDraft(draft);
    view.resetCommitProgress();
    if (!draft.validation.ok) return view.setStatus(draft.validation.errors.join(" "), "warning");
    if (!minorGoals.length && !tasks.length) {
      view.setStatus(hasAiGoalSeeds ? "Schedule generated with open hours. AI-assisted major-goal drafts are pending and not yet inserted." : "Schedule generated with open hours. Add goals or habits when you are ready.", "neutral");
      setCurrentStep(view.setStep(3));
      return;
    }
    view.setStatus(`Schedule generated (${draft.slots.length} slots).`, "success");
    setCurrentStep(view.setStep(3));
  });

  ui.clear.addEventListener("click", () => {
    clearDraftOnly();
    view.setStatus("Draft cleared.", "neutral");
  });
  ui.commit.addEventListener("click", async () => { await commitDraftToCalendar(); });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const link = target.closest("a[href]");
    if (!link) return;
    if (link.target && link.target !== "_self") return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    const nextUrl = new URL(link.href, window.location.href);
    if (nextUrl.href === window.location.href) return;
    if (!hasDraftPreview()) return;
    event.preventDefault();
    resolveDraftExitAction().then((decision) => {
      if (decision !== "proceed") return;
      setAllowPageExit(true);
      window.location.href = nextUrl.href;
    });
  }, true);

  window.addEventListener("beforeunload", (event) => {
    if (navigator.webdriver) return;
    if (getAllowPageExit() || !hasDraftPreview()) return;
    event.preventDefault();
    event.returnValue = "";
  });
};
