import { dayName } from "./planner-storage.js";

const renderList = (target, items, map, empty = "No items yet.") => {
  target.innerHTML = items.length ? items.map(map).join("") : `<li class="list-empty">${empty}</li>`;
};

const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayShort = (iso) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(iso).getDay()];

export const createPlannerView = (ui) => {
  const setStatus = (text, kind = "neutral") => {
    ui.status.dataset.kind = kind;
    ui.status.textContent = text;
  };

  const setPlannerLock = (locked) => {
    ui.lock.hidden = !locked;
    const controls = [ui.generate, ui.clear, ui.commit, ui.prev, ui.next, ui.aiBuildPrompt, ui.aiValidateImport, ui.aiApplyImport, ui.addCommitment, ui.addGoal, ui.addHabit];
    controls.forEach((control) => { if (control) control.disabled = locked; });
  };

  const renderCommitments = (items) => {
    renderList(
      ui.commitmentsList,
      items,
      (item) => `<li>${item.title} | ${item.mode} | ${item.start}-${item.end} <button type="button" class="inline-remove" data-rm-commitment="${item.id}">Remove</button></li>`,
    );
  };

  const renderGoals = (items) => {
    renderList(
      ui.goalsList,
      items,
      (item) => `<li>${item.title} (${item.weeklyHours}h, P${item.priority}) <button type="button" class="inline-remove" data-rm-goal="${item.id}">Remove</button></li>`,
    );
  };

  const renderHabits = (items) => {
    renderList(
      ui.habitsList,
      items,
      (item) => `<li>${item.name} (${item.frequency}x, ${item.durationMinutes}m, ${item.window}) <button type="button" class="inline-remove" data-rm-habit="${item.id}">Remove</button></li>`,
    );
  };

  const renderScheduleGrid = (slots) => {
    if (!slots.length) {
      ui.draftSchedule.innerHTML = `<p class="list-empty">No schedule generated yet.</p>`;
      return;
    }
    const grouped = new Map();
    slots.forEach((slot) => {
      const key = new Date(slot.start).toDateString();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(slot);
    });
    const orderedKeys = [...grouped.keys()].sort((left, right) => new Date(left) - new Date(right));
    ui.draftSchedule.innerHTML = orderedKeys.map((key) => {
      const daySlots = grouped.get(key).sort((left, right) => new Date(left.start) - new Date(right.start));
      return `<section class="schedule-day"><h3>${dayShort(daySlots[0].start)} ${new Date(daySlots[0].start).toLocaleDateString()}</h3>${daySlots.map((slot) => `<article class="schedule-slot"><p>${slot.title}</p><p>${formatTime(slot.start)} - ${formatTime(slot.end)}</p></article>`).join("")}</section>`;
    }).join("");
  };

  const renderDraft = (draft) => {
    if (!draft) {
      renderList(ui.draftList, [], (x) => x);
      renderList(ui.unscheduledList, [], (x) => x);
      renderList(ui.warningsList, [], (x) => x);
      renderScheduleGrid([]);
      return;
    }
    renderScheduleGrid(draft.slots || []);
    renderList(ui.draftList, draft.slots, (slot) => `<li>${slot.title} | ${new Date(slot.start).toLocaleString()} - ${formatTime(slot.end)}</li>`);
    renderList(ui.unscheduledList, draft.unscheduled || [], (item) => `<li>${item.title} <span class="warn">${item.reasonCode}</span></li>`, "No unscheduled items.");
    renderList(ui.warningsList, draft.warnings || [], (item) => `<li>${item.slotTitle} overlaps with "${item.existingTitle}"</li>`, "No conflicts.");
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

