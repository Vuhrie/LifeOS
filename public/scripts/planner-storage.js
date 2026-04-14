const STORAGE_KEY = "lifeos_planner_state_v1";

const defaultAvailability = () => [
  { day: 1, start: "19:00", end: "22:00", maxHours: 3, maxDeepBlocks: 2, hardBlock: false },
  { day: 2, start: "19:00", end: "22:00", maxHours: 3, maxDeepBlocks: 2, hardBlock: false },
  { day: 3, start: "19:00", end: "22:00", maxHours: 3, maxDeepBlocks: 2, hardBlock: false },
  { day: 4, start: "19:00", end: "22:00", maxHours: 3, maxDeepBlocks: 2, hardBlock: false },
  { day: 5, start: "19:00", end: "22:00", maxHours: 3, maxDeepBlocks: 2, hardBlock: false },
  { day: 6, start: "09:00", end: "13:00", maxHours: 4, maxDeepBlocks: 2, hardBlock: false },
  { day: 0, start: "09:00", end: "12:00", maxHours: 3, maxDeepBlocks: 2, hardBlock: false },
];

const emptyWeekState = () => ({
  minorGoals: [],
  tasks: [],
  availabilityRules: defaultAvailability(),
  draft: null,
  commitLog: [],
});

const defaultState = () => ({
  schemaVersion: 1,
  goals: [],
  currentWeekKey: "",
  weeks: {},
  history: [],
});

const mondayOfWeek = (date) => {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
};

export const getWeekKey = (date = new Date()) => {
  const year = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = year.getUTCDay() || 7;
  year.setUTCDate(year.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(year.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((year - yearStart) / 86400000) + 1) / 7);
  return `${year.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
};

export const getPlanningWeekKey = (now = new Date()) => {
  const copy = new Date(now);
  if (copy.getDay() === 0 && copy.getHours() >= 22) {
    copy.setDate(copy.getDate() + 1);
  }
  return getWeekKey(copy);
};

export const getWeekStartFromKey = (weekKey) => {
  const [yearStr, weekStr] = weekKey.split("-");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0, 0);
};

export const loadPlannerState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed !== "object") {
      return defaultState();
    }
    return parsed;
  } catch {
    return defaultState();
  }
};

export const savePlannerState = (state) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const ensureWeekState = (state, weekKey) => {
  if (!state.weeks[weekKey]) {
    state.weeks[weekKey] = emptyWeekState();
  }
  return state.weeks[weekKey];
};

export const rotateWeekIfNeeded = (state, now = new Date()) => {
  const nextWeekKey = getPlanningWeekKey(now);
  const currentWeekKey = state.currentWeekKey;
  if (!currentWeekKey) {
    state.currentWeekKey = nextWeekKey;
    ensureWeekState(state, nextWeekKey);
    return nextWeekKey;
  }
  if (currentWeekKey === nextWeekKey) {
    ensureWeekState(state, currentWeekKey);
    return currentWeekKey;
  }
  state.history.push({
    weekKey: currentWeekKey,
    archivedAt: new Date().toISOString(),
    snapshot: state.weeks[currentWeekKey] || emptyWeekState(),
  });
  state.currentWeekKey = nextWeekKey;
  ensureWeekState(state, nextWeekKey);
  return nextWeekKey;
};

export const createGoal = ({ title, deadlineIso, priority, weeklyHours }) => ({
  id: `goal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  title,
  deadlineIso,
  priority,
  weeklyHours,
  status: "active",
  createdAt: new Date().toISOString(),
});

export const createMinorGoal = ({ weekKey, title, targetHours }) => ({
  id: `mgoal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  weekKey,
  title,
  targetHours,
  status: "active",
});

export const createTask = ({ weekKey, title, estimateMinutes, priority, energy }) => ({
  id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  weekKey,
  title,
  estimateMinutes,
  priority,
  energy,
  status: "active",
});

export const dayName = (day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "Day";

export const normalizeTime = (value, fallback) => {
  const pattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return pattern.test(value) ? value : fallback;
};

export const toMinutes = (value) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

export const getDateForDay = (weekStart, day) => {
  const mondayDay = mondayOfWeek(weekStart);
  const offset = day === 0 ? 6 : day - 1;
  const target = new Date(mondayDay);
  target.setDate(mondayDay.getDate() + offset);
  return target;
};
