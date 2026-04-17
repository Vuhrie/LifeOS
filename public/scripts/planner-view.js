import { dayName } from "./planner-storage.js";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderList = (target, items, map, empty = "No items yet.") => {
  target.innerHTML = items.length ? items.map(map).join("") : `<li class="list-empty">${empty}</li>`;
};

const formatTime = (value) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

const formatDate = (value) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));

const draftCard = (item) => `
  <article class="draft-event-card" data-kind="${escapeHtml(item.kind)}">
    <p class="draft-event-time">${escapeHtml(formatTime(item.start))} - ${escapeHtml(formatTime(item.end))}</p>
    <h3>${escapeHtml(item.title)}</h3>
    <div class="draft-event-meta">
      <span class="draft-event-badge">${escapeHtml(item.badge)}</span>
      ${
        item.kind === "existing"
          ? `<button type="button" class="action-button draft-edit-imported" data-edit-imported="${escapeHtml(item.id)}">Edit</button><button type="button" class="inline-remove draft-remove-imported" data-rm-imported="${escapeHtml(item.id)}">Remove</button>`
          : ""
      }
    </div>
  </article>
`;

export const createPlannerView = (ui) => {
  const importanceLabel = (value) => {
    const level = Number(value || 3);
    if (level >= 5) return "Critical";
    if (level === 4) return "High";
    if (level === 3) return "Normal";
    if (level === 2) return "Low";
    return "Optional";
  };

  const setStatus = (text, kind = "neutral") => {
    ui.status.dataset.kind = kind;
    ui.status.textContent = text;
  };

  const setPlannerLock = (locked) => {
    ui.lock.hidden = !locked;
    const controls = [
      ui.generate,
      ui.clear,
      ui.commit,
      ui.prev,
      ui.next,
      ui.aiBuildPrompt,
      ui.aiValidateImport,
      ui.aiApplyImport,
      ui.majorGoalAiBuildPrompt,
      ui.majorGoalAiCopyPrompt,
      ui.majorGoalAiValidateImport,
      ui.majorGoalAiApplyImport,
      ui.majorGoalAiClearImport,
      ui.addCommitment,
      ui.addGoal,
      ui.addHabit,
      ui.aiChangedSince,
      ui.aiTaskProgressNotes,
      ui.aiBriefNotes,
      ui.aiPriorityMajorGoal,
      ui.commit,
    ];
    controls.forEach((control) => {
      if (control) control.disabled = locked;
    });
  };

  const renderCommitments = (items) => {
    const summary = (item) => {
      if (item.mode === "one_off") return `${item.date} | ${item.start}-${item.end}`;
      if (item.mode === "date_range_recurring") return `${item.startDate}..${item.endDate} | ${item.start}-${item.end}`;
      return `${(item.days || []).map((day) => dayName(day).slice(0, 3)).join(", ")} | ${item.start}-${item.end}`;
    };
    renderList(
      ui.commitmentsList,
      items,
      (item) =>
        `<li>${escapeHtml(item.title)} | ${escapeHtml(summary(item))} <span class="draft-event-badge">${escapeHtml(item.source === "google_imported" ? "Imported" : "Manual")}</span> <button type="button" class="action-button draft-edit-imported" data-edit-commitment="${item.id}">Edit</button> <button type="button" class="inline-remove" data-rm-commitment="${item.id}">Remove</button></li>`,
    );
  };

  const renderGoals = ({ goals, aiGoalSeeds }) => {
    const goalItems = Array.isArray(goals) ? goals : [];
    const seedItems = Array.isArray(aiGoalSeeds) ? aiGoalSeeds : [];
    const rows = [
      ...goalItems.map((item) => {
        const strategy = String(item.scheduleBuilderInstruction || "").trim();
        const strategyNote = strategy ? ` | Strategy: ${escapeHtml(strategy)}` : "";
        return `<li>${escapeHtml(item.title)} (deadline ${escapeHtml(String(item.deadlineIso || "").slice(0, 10) || "TBD")}, ${escapeHtml(importanceLabel(item.importance ?? item.priority))} importance)${strategyNote} <span class="draft-event-badge">${escapeHtml(item.source === "ai_assisted" ? "AI Assisted" : "Manual")}</span> <button type="button" class="inline-remove" data-rm-goal="${item.id}">Remove</button></li>`;
      }),
      ...seedItems.map((item) =>
        `<li>${escapeHtml(item.title)} (AI draft${item.targetDate ? `, target ${escapeHtml(item.targetDate)}` : ""}) <span class="draft-event-badge">AI Draft</span> <button type="button" class="inline-remove" data-rm-ai-goal-seed="${item.id}">Remove</button></li>`),
    ];
    renderList(
      ui.goalsList,
      rows,
      (item) => item,
      "No major goals or AI-assisted drafts yet.",
    );
  };

  const renderHabits = (items) => {
    renderList(
      ui.habitsList,
      items,
      (item) =>
        `<li>${escapeHtml(item.name)} (${item.frequency}x, ${item.durationMinutes}m, ${escapeHtml(item.window)}) <button type="button" class="inline-remove" data-rm-habit="${item.id}">Remove</button></li>`,
    );
  };

  const renderMinorGoals = (items, majorGoals) => {
    const majorById = new Map((majorGoals || []).map((item) => [item.id, item.title]));
    renderList(
      ui.minorGoalsList,
      items,
      (item) =>
        `<li>${escapeHtml(item.title)} | ${escapeHtml(majorById.get(item.majorGoalId) || "Unlinked Major Goal")} | ${escapeHtml((item.deadlineIso || "").slice(0, 10) || "No deadline")} | ${escapeHtml(item.status || "active")}</li>`,
      "No AI-managed minor goals yet.",
    );
  };

  const renderTasks = (items, minorGoals) => {
    const minorById = new Map((minorGoals || []).map((item) => [item.id, item.title]));
    renderList(
      ui.tasksList,
      items,
      (item) => `
        <li>
          ${escapeHtml(item.title)} | ${escapeHtml(minorById.get(item.minorGoalId) || "Unlinked Minor Goal")} |
          <select data-task-status="${escapeHtml(item.id)}">
            <option value="not_started" ${item.status === "not_started" ? "selected" : ""}>Not Started</option>
            <option value="scheduled" ${item.status === "scheduled" ? "selected" : ""}>Scheduled</option>
            <option value="done" ${item.status === "done" ? "selected" : ""}>Done</option>
            <option value="skipped" ${item.status === "skipped" ? "selected" : ""}>Skipped</option>
            <option value="blocked" ${item.status === "blocked" ? "selected" : ""}>Blocked</option>
          </select>
        </li>`,
      "No AI-managed tasks yet.",
    );
  };

  const renderDraftSchedule = (draft) => {
    if (!draft?.preview?.days?.length) {
      ui.draftSchedule.innerHTML = `<article class="event-empty"><h2>No schedule generated</h2><p>Generate a draft to preview your upcoming calendar.</p></article>`;
      return;
    }
    ui.draftSchedule.innerHTML = draft.preview.days
      .map(
        (day) => `
        <section class="draft-day-group">
          <h3>${escapeHtml(formatDate(day.date))}</h3>
          <div class="draft-day-list">
            ${day.items.length ? day.items.map(draftCard).join("") : `<article class="event-empty event-empty--day"><p>Nothing scheduled yet.</p></article>`}
          </div>
        </section>`,
      )
      .join("");
  };

  const renderDraft = (draft) => {
    if (!draft) {
      renderList(ui.unscheduledList, [], (x) => x);
      renderList(ui.warningsList, [], (x) => x);
      renderDraftSchedule(null);
      return;
    }
    renderDraftSchedule(draft);
    renderList(
      ui.unscheduledList,
      draft.unscheduled || [],
      (item) => `<li>${escapeHtml(item.title)} <span class="warn">${escapeHtml(item.reasonCode)}</span></li>`,
      "No unscheduled items.",
    );
    renderList(
      ui.warningsList,
      draft.warnings || [],
      (item) => `<li>${escapeHtml(item.slotTitle)} overlaps with "${escapeHtml(item.existingTitle)}"</li>`,
      "No conflicts.",
    );
  };

  const setStep = (step) => {
    const currentStep = Math.max(1, Math.min(3, step));
    ui.stepPills.forEach((pill) => pill.classList.toggle("is-active", Number(pill.dataset.step) === currentStep));
    ui.stepPanels.forEach((panel) => panel.classList.toggle("is-active", Number(panel.dataset.stepPanel) === currentStep));
    ui.prev.disabled = currentStep === 1;
    ui.next.hidden = currentStep === 3;
    if (ui.commit) ui.commit.hidden = currentStep !== 3;
    return currentStep;
  };

  const resetCommitProgress = () => {
    if (!ui.commitProgress) return;
    ui.commitProgress.hidden = true;
    ui.commitProgressPhase.textContent = "Idle";
    ui.commitProgressBar.style.width = "0%";
    ui.commitProgressMeta.textContent = "0%";
    ui.commitProgressCurrent.textContent = "Waiting to commit.";
    ui.commitProgressCounts.textContent = "Deleted 0 | Added 0 | Failed 0";
    ui.commitProgressLog.innerHTML = "";
  };

  const showCommitProgress = () => {
    if (!ui.commitProgress) return;
    ui.commitProgress.hidden = false;
  };

  const updateCommitProgress = ({
    phase = "Working",
    percent = 0,
    current = "",
    deleted = 0,
    added = 0,
    failed = 0,
  }) => {
    if (!ui.commitProgress) return;
    const bounded = Math.max(0, Math.min(100, Number(percent || 0)));
    ui.commitProgress.hidden = false;
    ui.commitProgressPhase.textContent = phase;
    ui.commitProgressBar.style.width = `${bounded}%`;
    ui.commitProgressMeta.textContent = `${Math.round(bounded)}%`;
    if (current) ui.commitProgressCurrent.textContent = current;
    ui.commitProgressCounts.textContent = `Deleted ${deleted} | Added ${added} | Failed ${failed}`;
  };

  const appendCommitProgressLog = (text) => {
    if (!ui.commitProgressLog || !text) return;
    const li = document.createElement("li");
    li.textContent = text;
    ui.commitProgressLog.appendChild(li);
    while (ui.commitProgressLog.children.length > 8) {
      ui.commitProgressLog.removeChild(ui.commitProgressLog.firstChild);
    }
    ui.commitProgressLog.scrollTop = ui.commitProgressLog.scrollHeight;
  };

  const renderPriorityMajorGoalOptions = (goals, selectedId = "") => {
    if (!ui.aiPriorityMajorGoal) return;
    const options = [`<option value="">No focus override</option>`]
      .concat((goals || []).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.title)}</option>`));
    ui.aiPriorityMajorGoal.innerHTML = options.join("");
  };

  return {
    setStatus,
    setPlannerLock,
    renderCommitments,
    renderGoals,
    renderHabits,
    renderMinorGoals,
    renderTasks,
    renderDraft,
    renderPriorityMajorGoalOptions,
    setStep,
    resetCommitProgress,
    showCommitProgress,
    updateCommitProgress,
    appendCommitProgressLog,
  };
};
