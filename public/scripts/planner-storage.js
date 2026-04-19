import { getPlanningWeekKey } from "./planner-time.js";
import {
  defaultState,
  defaultWeekState,
  getStorageKey,
  normalizeWeekState,
  parse,
  uid,
} from "./planner-storage-state.js";

export const loadPlannerState = (accountKey = "anon") => {
  try {
    const raw = window.localStorage.getItem(getStorageKey(accountKey));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultState();
    const state = {
      schemaVersion: 13,
      currentWeekKey: String(parsed.currentWeekKey || ""),
      weeks: {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
    Object.entries(parse(parsed.weeks, {})).forEach(([key, value]) => {
      state.weeks[key] = normalizeWeekState(value);
    });
    return state;
  } catch {
    return defaultState();
  }
};

export const savePlannerState = (state, accountKey = "anon") => {
  window.localStorage.setItem(getStorageKey(accountKey), JSON.stringify(state));
};

export const ensureWeekState = (state, weekKey) => {
  if (!state.weeks[weekKey]) state.weeks[weekKey] = defaultWeekState();
  state.weeks[weekKey] = normalizeWeekState(state.weeks[weekKey]);
  return state.weeks[weekKey];
};

export const rotateWeekIfNeeded = (state, now = new Date()) => {
  const nextWeekKey = getPlanningWeekKey(now);
  if (!state.currentWeekKey) {
    state.currentWeekKey = nextWeekKey;
    ensureWeekState(state, nextWeekKey);
    return nextWeekKey;
  }
  if (state.currentWeekKey === nextWeekKey) {
    ensureWeekState(state, state.currentWeekKey);
    return state.currentWeekKey;
  }
  state.history.push({
    weekKey: state.currentWeekKey,
    archivedAt: new Date().toISOString(),
    snapshot: state.weeks[state.currentWeekKey] || defaultWeekState(),
  });
  state.currentWeekKey = nextWeekKey;
  ensureWeekState(state, nextWeekKey);
  return nextWeekKey;
};

export const createGoal = ({
  title,
  deadlineIso = "",
  importance = 3,
  deadlineSource = "manual",
  source = "manual",
  doneCondition = "",
  scheduleBuilderInstruction = "",
}) => ({
  id: uid("goal"),
  title,
  deadlineIso,
  importance,
  priority: importance,
  status: "active",
  deadlineSource,
  source,
  doneCondition: String(doneCondition || ""),
  scheduleBuilderInstruction: String(scheduleBuilderInstruction || ""),
  createdAt: new Date().toISOString(),
});

export const createAiMajorGoalSeed = ({ title, targetDate = "", notes = "" }) => ({
  id: uid("gseed"),
  title,
  targetDate,
  notes,
  status: "draft",
  createdAt: new Date().toISOString(),
});

export const createHabit = ({ name, frequency, durationMinutes, window }) => ({
  id: uid("habit"),
  name,
  frequency,
  durationMinutes,
  window,
  status: "active",
});

export const createTask = ({
  weekKey,
  title,
  estimateMinutes,
  priority,
  energy,
  habitId = "",
  preferredWindow = "",
  majorGoalId = "",
  minorGoalId = "",
  status = "active",
  source = "ai",
}) => ({
  id: uid("task"),
  weekKey,
  title,
  estimateMinutes,
  priority,
  energy,
  habitId: String(habitId || ""),
  preferredWindow: String(preferredWindow || ""),
  majorGoalId: String(majorGoalId || ""),
  minorGoalId: String(minorGoalId || ""),
  status: String(status || "active"),
  source: String(source || "ai"),
  updatedAt: new Date().toISOString(),
});

export const createMinorGoal = ({
  majorGoalId,
  title,
  deadlineIso = "",
  status = "active",
  notes = "",
  source = "ai",
}) => ({
  id: uid("mgoal"),
  majorGoalId: String(majorGoalId || ""),
  title,
  deadlineIso,
  status,
  notes,
  source,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const createCommitment = ({
  mode,
  title,
  start,
  end,
  days,
  startDate,
  endDate,
  date,
  source = "manual",
  googleEventId = "",
}) => ({
  id: uid("commit"),
  mode,
  title,
  start,
  end,
  days: days || [],
  startDate: startDate || "",
  endDate: endDate || "",
  date: date || "",
  isLocked: true,
  source: String(source || "manual"),
  googleEventId: String(googleEventId || ""),
});

export {
  buildAvailabilityRulesFromProfile,
  dayName,
  getDateForDay,
  getPlanningWeekKey,
  getWeekKey,
  getWeekStartFromKey,
  normalizeTime,
  toMinutes,
} from "./planner-time.js";
