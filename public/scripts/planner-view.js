import { dayName } from "./planner-storage.js";

const renderList = (target, items, map) => {
  target.innerHTML = items.length ? items.map(map).join("") : `<li class="list-empty">No items yet.</li>`;
};

export const createPlannerView = (ui) => {
  const setStatus = (text, kind = "neutral") => {
    ui.status.dataset.kind = kind;
    ui.status.textContent = text;
  };

  const renderFixedCommitments = (items) => {
    renderList(
      ui.fixedList,
      items,
      (item) =>
        `<li>${dayName(item.day)} ${item.start}-${item.end} <button type="button" class="inline-remove" data-rm-fixed="${item.id}">Remove</button></li>`,
    );
  };

  const renderStaticCommitments = (items) => {
    renderList(
      ui.staticList,
      items,
      (item) =>
        `<li>${item.title} | ${item.startDate} to ${item.endDate} | ${item.start}-${item.end} <button type="button" class="inline-remove" data-rm-static="${item.id}">Remove</button></li>`,
    );
  };

  const renderMinorGoals = (items) => {
    renderList(
      ui.minorList,
      items,
      (item) => `<li>${item.title} (${item.targetHours}h) <button type="button" class="inline-remove" data-rm-minor="${item.id}">Remove</button></li>`,
    );
  };

  const renderTasks = (items) => {
    renderList(
      ui.taskList,
      items,
      (item) => `<li>${item.title} (${item.estimateMinutes}m, ${item.energy}) <button type="button" class="inline-remove" data-rm-task="${item.id}">Remove</button></li>`,
    );
  };

  const renderAvailability = (rules) => {
    ui.availability.innerHTML = rules
      .map(
        (rule) => `
      <div class="availability-row" data-day="${rule.day}">
        <p>${dayName(rule.day)}</p>
        <label>Start <input type="time" data-field="start" value="${rule.start}"></label>
        <label>End <input type="time" data-field="end" value="${rule.end}"></label>
        <label>Max Hours <input type="number" min="0" max="16" step="0.5" data-field="maxHours" value="${rule.maxHours}"></label>
        <label>Deep Blocks <input type="number" min="0" max="8" step="1" data-field="maxDeepBlocks" value="${rule.maxDeepBlocks}"></label>
      </div>`,
      )
      .join("");
  };

  const renderDraft = (draft) => {
    if (!draft) {
      renderList(ui.draftList, [], (x) => x);
      renderList(ui.unscheduledList, [], (x) => x);
      renderList(ui.warningsList, [], (x) => x);
      return;
    }
    renderList(
      ui.draftList,
      draft.slots,
      (slot) =>
        `<li>${slot.title} | ${new Date(slot.start).toLocaleString()} - ${new Date(slot.end).toLocaleTimeString()} <span class="muted">score ${slot.score}${slot.preserved ? " | kept" : ""}</span></li>`,
    );
    renderList(
      ui.unscheduledList,
      draft.unscheduled,
      (item) => `<li>${item.title} <span class="warn">${item.reasonCode}</span></li>`,
    );
    renderList(ui.warningsList, draft.warnings, (w) => `<li>${w.slotTitle} overlaps with "${w.existingTitle}"</li>`);
  };

  const setStep = (step) => {
    const currentStep = Math.max(1, Math.min(3, step));
    ui.stepPills.forEach((pill) => pill.classList.toggle("is-active", Number(pill.dataset.step) === currentStep));
    ui.stepPanels.forEach((panel) => panel.classList.toggle("is-active", Number(panel.dataset.stepPanel) === currentStep));
    ui.prev.disabled = currentStep === 1;
    ui.next.hidden = currentStep === 3;
    return currentStep;
  };

  return {
    renderFixedCommitments,
    renderStaticCommitments,
    renderMinorGoals,
    renderTasks,
    renderAvailability,
    renderDraft,
    setStatus,
    setStep,
  };
};
