import { createCalendarWriteClient } from "./calendar-write-client.js";
import { generateDraftPlan, previewOverlapWarnings } from "./planner-engine.js";
import {
  createGoal,
  createMinorGoal,
  createTask,
  dayName,
  ensureWeekState,
  getPlanningWeekKey,
  getWeekStartFromKey,
  loadPlannerState,
  normalizeTime,
  rotateWeekIfNeeded,
  savePlannerState,
} from "./planner-storage.js";

const $ = (id) => document.querySelector(id);
const ui = {
  status: $("#planner-status"),
  connect: $("#connect-google"),
  generate: $("#generate-draft"),
  clear: $("#clear-draft"),
  commit: $("#commit-draft"),
  goalTitle: $("#goal-title"),
  goalDeadline: $("#goal-deadline"),
  goalPriority: $("#goal-priority"),
  goalHours: $("#goal-weekly-hours"),
  minorTitle: $("#minor-goal-title"),
  minorHours: $("#minor-goal-hours"),
  addMinor: $("#add-minor-goal"),
  minorList: $("#minor-goals-list"),
  taskTitle: $("#task-title"),
  taskEstimate: $("#task-estimate"),
  taskPriority: $("#task-priority"),
  taskEnergy: $("#task-energy"),
  addTask: $("#add-task"),
  taskList: $("#tasks-list"),
  availability: $("#availability-grid"),
  draftList: $("#draft-list"),
  unscheduledList: $("#unscheduled-list"),
  warningsList: $("#warnings-list"),
};

const app = loadPlannerState();
const weekKey = rotateWeekIfNeeded(app, new Date());
const week = ensureWeekState(app, weekKey);
const save = () => savePlannerState(app);
const setStatus = (text, kind = "neutral") => {
  ui.status.dataset.kind = kind;
  ui.status.textContent = text;
};

const renderList = (target, items, map) => {
  target.innerHTML = items.length ? items.map(map).join("") : `<li class="list-empty">No items yet.</li>`;
};

const getGoalPayload = () => ({
  title: ui.goalTitle.value.trim(),
  deadlineIso: ui.goalDeadline.value ? `${ui.goalDeadline.value}T23:59:59` : "",
  priority: Number(ui.goalPriority.value),
  weeklyHours: Number(ui.goalHours.value),
});

const upsertGoal = () => {
  const payload = getGoalPayload();
  const goal = app.goals.find((item) => item.status === "active");
  if (!goal) app.goals = [createGoal(payload)];
  else Object.assign(goal, payload);
};

const renderMinor = () =>
  renderList(
    ui.minorList,
    week.minorGoals,
    (item) => `<li>${item.title} (${item.targetHours}h) <button type="button" class="inline-remove" data-rm-minor="${item.id}">Remove</button></li>`,
  );

const renderTasks = () =>
  renderList(
    ui.taskList,
    week.tasks,
    (item) => `<li>${item.title} (${item.estimateMinutes}m, ${item.energy}) <button type="button" class="inline-remove" data-rm-task="${item.id}">Remove</button></li>`,
  );

const renderAvailability = () => {
  ui.availability.innerHTML = week.availabilityRules
    .map(
      (rule) => `
      <div class="availability-row" data-day="${rule.day}">
        <p>${dayName(rule.day)}</p>
        <label>Start <input type="time" data-field="start" value="${rule.start}"></label>
        <label>End <input type="time" data-field="end" value="${rule.end}"></label>
        <label>Max Hours <input type="number" min="0" max="12" step="1" data-field="maxHours" value="${rule.maxHours}"></label>
        <label>Deep Blocks <input type="number" min="0" max="8" step="1" data-field="maxDeepBlocks" value="${rule.maxDeepBlocks}"></label>
      </div>`,
    )
    .join("");
};

const renderDraft = () => {
  const draft = week.draft;
  if (!draft) {
    renderList(ui.draftList, [], (x) => x);
    renderList(ui.unscheduledList, [], (x) => x);
    renderList(ui.warningsList, [], (x) => x);
    return;
  }
  renderList(
    ui.draftList,
    draft.slots,
    (slot) => `<li>${slot.title} | ${new Date(slot.start).toLocaleString()} - ${new Date(slot.end).toLocaleTimeString()} <span class="muted">score ${slot.score}</span></li>`,
  );
  renderList(
    ui.unscheduledList,
    draft.unscheduled,
    (item) => `<li>${item.title} <span class="warn">${item.reasonCode}</span></li>`,
  );
  renderList(
    ui.warningsList,
    draft.warnings,
    (w) => `<li>${w.slotTitle} overlaps with "${w.existingTitle}"</li>`,
  );
};

const writeClient = createCalendarWriteClient({
  onStateChange: (s) => {
    ui.commit.disabled = !s.isSignedIn || s.isLoading;
    if (s.error) setStatus(s.error, "error");
  },
});

ui.connect.addEventListener("click", async () => {
  try {
    await writeClient.connect();
    setStatus("Google Calendar write access connected.", "success");
  } catch (error) {
    writeClient.setError(error.message);
  }
});

ui.addMinor.addEventListener("click", () => {
  const title = ui.minorTitle.value.trim();
  const targetHours = Number(ui.minorHours.value);
  if (!title || targetHours <= 0) return setStatus("Minor goal title and hours are required.", "warning");
  week.minorGoals.push(createMinorGoal({ weekKey, title, targetHours }));
  ui.minorTitle.value = "";
  save();
  renderMinor();
});

ui.addTask.addEventListener("click", () => {
  const title = ui.taskTitle.value.trim();
  const estimateMinutes = Number(ui.taskEstimate.value);
  if (!title || estimateMinutes < 30) return setStatus("Task title and estimate (>=30 mins) are required.", "warning");
  week.tasks.push(
    createTask({
      weekKey,
      title,
      estimateMinutes,
      priority: Number(ui.taskPriority.value),
      energy: ui.taskEnergy.value,
    }),
  );
  ui.taskTitle.value = "";
  save();
  renderTasks();
});

document.addEventListener("click", (event) => {
  const t = event.target;
  if (!(t instanceof HTMLElement)) return;
  const minorId = t.getAttribute("data-rm-minor");
  if (minorId) {
    week.minorGoals = week.minorGoals.filter((item) => item.id !== minorId);
    save();
    renderMinor();
    return;
  }
  const taskId = t.getAttribute("data-rm-task");
  if (taskId) {
    week.tasks = week.tasks.filter((item) => item.id !== taskId);
    save();
    renderTasks();
  }
});

ui.availability.addEventListener("change", (event) => {
  const t = event.target;
  if (!(t instanceof HTMLInputElement)) return;
  const row = t.closest(".availability-row");
  if (!row) return;
  const day = Number(row.getAttribute("data-day"));
  const field = t.getAttribute("data-field");
  const rule = week.availabilityRules.find((item) => item.day === day);
  if (!rule || !field) return;
  if (field === "start" || field === "end") rule[field] = normalizeTime(t.value, rule[field]);
  else rule[field] = Number(t.value) || rule[field];
  save();
});

ui.generate.addEventListener("click", async () => {
  upsertGoal();
  const goal = app.goals.find((item) => item.status === "active");
  if (!goal) return setStatus("Goal setup is required before generating draft.", "warning");
  const weekStart = getWeekStartFromKey(weekKey);
  const draft = generateDraftPlan({
    goal,
    minorGoals: week.minorGoals,
    tasks: week.tasks,
    availabilityRules: week.availabilityRules,
    weekStart,
  });
  week.draft = draft;
  if (!draft.validation.ok) {
    setStatus(draft.validation.errors.join(" "), "warning");
    save();
    renderDraft();
    return;
  }
  try {
    const events = await writeClient.fetchExistingEvents({
      startIso: weekStart.toISOString(),
      endIso: new Date(weekStart.getTime() + 7 * 86400000).toISOString(),
    });
    draft.warnings = previewOverlapWarnings(draft.slots, events);
  } catch (error) {
    setStatus(`Draft ready. Conflict preview unavailable: ${error.message}`, "warning");
  }
  save();
  renderDraft();
  setStatus(`Draft generated.${draft.warnings.length ? ` ${draft.warnings.length} overlap warnings found.` : ""}`, "success");
});

ui.clear.addEventListener("click", () => {
  week.draft = null;
  save();
  renderDraft();
  setStatus("Draft cleared.", "neutral");
});

ui.commit.addEventListener("click", async () => {
  if (!week.draft?.slots?.length) return setStatus("Generate a draft before committing.", "warning");
  try {
    const result = await writeClient.commitDraft(week.draft.slots);
    week.commitLog.push({
      commitId: result.commitId,
      timestamp: new Date().toISOString(),
      writes: result.writes,
      warningCount: week.draft.warnings.length,
    });
    save();
    setStatus(`Committed ${result.writes.length} events to Google Calendar.`, "success");
  } catch (error) {
    setStatus(`Commit failed: ${error.message}`, "error");
  }
});

(() => {
  const goal = app.goals.find((item) => item.status === "active");
  if (goal) {
    ui.goalTitle.value = goal.title;
    ui.goalDeadline.value = goal.deadlineIso.slice(0, 10);
    ui.goalPriority.value = String(goal.priority);
    ui.goalHours.value = String(goal.weeklyHours);
  }
  renderMinor();
  renderTasks();
  renderAvailability();
  renderDraft();
  ui.commit.disabled = !writeClient.getState().isSignedIn;
  const note = getPlanningWeekKey(new Date()) === weekKey ? "" : " Week rotated to new cycle.";
  setStatus(`Planner ready for week ${weekKey}.${note}`, "neutral");
})();
