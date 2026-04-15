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
    <span class="draft-event-badge">${escapeHtml(item.badge)}</span>
  </article>
`;

export const createPlannerView = (ui) => {
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
      ui.addCommitment,
      ui.addGoal,
      ui.addHabit,
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
        `<li>${escapeHtml(item.title)} | ${escapeHtml(summary(item))} <button type="button" class="inline-remove" data-rm-commitment="${item.id}">Remove</button></li>`,
    );
  };

  const renderGoals = (items) => {
    renderList(
      ui.goalsList,
      items,
      (item) =>
        `<li>${escapeHtml(item.title)} (${item.weeklyHours}h, P${item.priority}) <button type="button" class="inline-remove" data-rm-goal="${item.id}">Remove</button></li>`,
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
            ${day.items.map(draftCard).join("")}
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
    return currentStep;
  };

  return { setStatus, setPlannerLock, renderCommitments, renderGoals, renderHabits, renderDraft, setStep };
};
