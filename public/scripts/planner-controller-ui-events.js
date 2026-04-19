import { dateOnly, hmOf, withHm } from "./planner-controller-helpers.js";

export const registerPlannerUiEvents = ({
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
  getMajorGoalMode,
  getWeek,
  getLatestImportedEventsById,
  getSessionDraft,
  rebuildDraftPreview,
  setCurrentStep,
}) => {
  ui.prev.addEventListener("click", () => setCurrentStep((value) => view.setStep(value - 1)));
  ui.next.addEventListener("click", () => setCurrentStep((value) => view.setStep(value + 1)));
  ui.stepPills.forEach((pill) => pill.addEventListener("click", () => setCurrentStep(() => view.setStep(Number(pill.dataset.step)))));
  [ui.wake, ui.sleep, ui.horizonDays, ui.lockedHours, ui.needBreakfast, ui.needDinner, ui.needMorningShower, ui.needNightShower]
    .forEach((input) => input.addEventListener("change", onProfileChange));
  [ui.aiChangedSince, ui.aiTaskProgressNotes, ui.aiBriefNotes, ui.aiPriorityMajorGoal].forEach((input) => {
    input?.addEventListener("change", onPlannerBriefChange);
    input?.addEventListener("input", onPlannerBriefChange);
  });
  ui.majorGoalModeButtons?.forEach((button) => {
    button.addEventListener("click", () => setMajorGoalMode(button.dataset.majorGoalMode || "manual"));
  });

  ui.addCommitment.addEventListener("click", () => {
    const week = getWeek();
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
    const week = getWeek();
    const majorGoalMode = getMajorGoalMode();
    if (!majorGoalMode) return view.setStatus("Choose Manual or AI Assisted mode first.", "warning");
    if (majorGoalMode !== "manual") return view.setStatus("Switch to Manual mode to add direct major goals.", "warning");
    const title = ui.goalTitle.value.trim();
    const deadline = dateOnly(ui.goalDeadline.value);
    const importance = Number(ui.goalImportance.value);
    if (!title) return view.setStatus("Major goal title is required.", "warning");
    week.goals.push(createGoal({
      title,
      deadlineIso: deadline ? `${deadline}T23:59:59` : "",
      importance,
      deadlineSource: deadline ? "manual" : "ai_assessed_pending",
      source: "manual",
    }));
    ui.goalTitle.value = "";
    ui.goalDeadline.value = "";
    save();
    rerenderAll();
    view.setStatus(deadline ? "Major goal added." : "Major goal added. AI may propose a deadline.", "success");
  });

  ui.addHabit.addEventListener("click", () => {
    const week = getWeek();
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
    const week = getWeek();
    const commitmentId = target.getAttribute("data-rm-commitment");
    const editCommitmentId = target.getAttribute("data-edit-commitment");
    const goalId = target.getAttribute("data-rm-goal");
    const habitId = target.getAttribute("data-rm-habit");
    const removeAiGoalSeedId = target.getAttribute("data-rm-ai-goal-seed");
    const editImportedEventId = target.getAttribute("data-edit-imported");
    const importedEventId = target.getAttribute("data-rm-imported");
    if (removeAiGoalSeedId) {
      const confirmRemove = window.confirm("Remove this AI-assisted major-goal draft?");
      if (!confirmRemove) return;
      week.aiMajorGoalSeeds = (week.aiMajorGoalSeeds || []).filter((item) => item.id !== removeAiGoalSeedId);
      save();
      rerenderAll();
      view.setStatus("AI-assisted major-goal draft removed.", "neutral");
      return;
    }
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
      const editableEvent = getLatestImportedEventsById().get(editImportedEventId);
      if (!editableEvent) return view.setStatus("Imported event could not be found in the current draft.", "warning");
      const shouldEdit = window.confirm("This event is imported from Google Calendar. Continue editing it from LifeOS?");
      if (!shouldEdit) return;
      const nextTitle = window.prompt("Event title", String(editableEvent.title || "").trim());
      if (nextTitle === null) return;
      const nextStartHm = window.prompt("Start time (HH:MM, 24-hour)", hmOf(editableEvent.start));
      if (nextStartHm === null) return;
      const nextEndHm = window.prompt("End time (HH:MM, 24-hour)", hmOf(editableEvent.end));
      if (nextEndHm === null) return;
      const startDate = withHm(editableEvent.start, nextStartHm);
      const endDate = withHm(editableEvent.end, nextEndHm);
      if (!startDate || !endDate || endDate <= startDate) return view.setStatus("Invalid imported event time range.", "warning");
      week.importedEventEdits[editImportedEventId] = {
        title: String(nextTitle || editableEvent.title || "Imported event"),
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        description: String(editableEvent.description || ""),
      };
      week.ignoredGoogleEventIds = week.ignoredGoogleEventIds.filter((id) => id !== editImportedEventId);
      rebuildDraftPreview();
      save();
      view.renderDraft(getSessionDraft());
      view.setStatus("Imported event updated in planner draft. Commit to apply to Google.", "warning");
      return;
    }
    if (importedEventId) {
      const shouldRemove = window.confirm("This event is imported from Google Calendar. Remove it from your LifeOS plan and delete it from Google when you commit?");
      if (!shouldRemove) return;
      if (!week.ignoredGoogleEventIds.includes(importedEventId)) week.ignoredGoogleEventIds.push(importedEventId);
      delete week.importedEventEdits[importedEventId];
      rebuildDraftPreview();
      save();
      view.renderDraft(getSessionDraft());
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
      week.tasks = week.tasks.filter((item) => item.majorGoalId !== goalId && !removedMinorIds.includes(item.minorGoalId));
      cleanupPlannerWeek(week);
    }
    if (habitId) {
      week.habits = week.habits.filter((item) => item.id !== habitId);
      week.tasks = (week.tasks || []).filter((item) => String(item?.habitId || "") !== habitId);
      week.managedSlots = (week.managedSlots || []).filter((slot) => String(slot?.habitId || "") !== habitId && String(slot?.type || "") !== "habit");
    }
    if (commitmentId || goalId || habitId) {
      save();
      rerenderAll();
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const taskId = target.getAttribute("data-task-status");
    if (!taskId) return;
    const week = getWeek();
    const task = week.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.status = target.value;
    task.updatedAt = new Date().toISOString();
    save();
    rerenderAll();
    view.setStatus("Task progress updated for AI planning context.", "success");
  });
};
