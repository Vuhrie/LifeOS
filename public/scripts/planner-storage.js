const STORAGE_KEY = "lifeos_planner_state_v1";

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const defaultProfile = () => ({
  wakeTime: "07:00",
  sleepTime: "22:00",
  fixedCommitments: [],
  habits: {
    gym: { enabled: false, frequency: 3 },
    leisure: { enabled: true, frequency: 5 },
  },
});

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
  profile: defaultProfile(),
  minorGoals: [],
  tasks: [],
  availabilityRules: defaultAvailability(),
  draft: null,
  commitLog: [],
  aiAssist: {
    lastPrompt: "",
    lastImportText: "",
    lastAppliedAt: "",
    lastApplySummary: "",
  },
});

const defaultState = () => ({
  schemaVersion: 3,
  goals: [],
  currentWeekKey: "",
  weeks: {},
  history: [],
});

const parse = (raw, fallback) => (raw && typeof raw === "object" ? raw : fallback);

const sanitizeProfile = (profile) => {
  const next = parse(profile, {});
  const habits = parse(next.habits, {});
  return {
    wakeTime: normalizeTime(next.wakeTime, "07:00"),
    sleepTime: normalizeTime(next.sleepTime, "22:00"),
    fixedCommitments: Array.isArray(next.fixedCommitments) ? next.fixedCommitments : [],
    habits: {
      gym: {
        enabled: Boolean(parse(habits.gym, {}).enabled),
        frequency: Math.max(0, Math.min(14, Number(parse(habits.gym, {}).frequency || 3))),
      },
      leisure: {
        enabled: parse(habits.leisure, {}).enabled !== false,
        frequency: Math.max(0, Math.min(14, Number(parse(habits.leisure, {}).frequency || 5))),
      },
    },
  };
};

const normalizeWeekState = (week) => {
  const normalized = parse(week, emptyWeekState());
  return {
    profile: sanitizeProfile(normalized.profile),
    minorGoals: Array.isArray(normalized.minorGoals) ? normalized.minorGoals : [],
    tasks: Array.isArray(normalized.tasks) ? normalized.tasks : [],
    availabilityRules: Array.isArray(normalized.availabilityRules) && normalized.availabilityRules.length
      ? normalized.availabilityRules
      : defaultAvailability(),
    draft: normalized.draft || null,
    commitLog: Array.isArray(normalized.commitLog) ? normalized.commitLog : [],
    aiAssist: {
      lastPrompt: String(parse(normalized.aiAssist, {}).lastPrompt || ""),
      lastImportText: String(parse(normalized.aiAssist, {}).lastImportText || ""),
      lastAppliedAt: String(parse(normalized.aiAssist, {}).lastAppliedAt || ""),
      lastApplySummary: String(parse(normalized.aiAssist, {}).lastApplySummary || ""),
    },
  };
};

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
  if (copy.getDay() === 0 && copy.getHours() >= 22) copy.setDate(copy.getDate() + 1);
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
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultState();
    const state = {
      schemaVersion: 3,
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      currentWeekKey: typeof parsed.currentWeekKey === "string" ? parsed.currentWeekKey : "",
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

export const savePlannerState = (state) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const ensureWeekState = (state, weekKey) => {
  if (!state.weeks[weekKey]) state.weeks[weekKey] = emptyWeekState();
  state.weeks[weekKey] = normalizeWeekState(state.weeks[weekKey]);
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
  if (currentWeekKey === nextWeekKey) return ensureWeekState(state, currentWeekKey) && currentWeekKey;
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
  id: uid("goal"),
  title,
  deadlineIso,
  priority,
  weeklyHours,
  status: "active",
  createdAt: new Date().toISOString(),
});

export const createMinorGoal = ({ weekKey, title, targetHours }) => ({
  id: uid("mgoal"),
  weekKey,
  title,
  targetHours,
  status: "active",
});

export const createTask = ({ weekKey, title, estimateMinutes, priority, energy }) => ({
  id: uid("task"),
  weekKey,
  title,
  estimateMinutes,
  priority,
  energy,
  status: "active",
});

export const createFixedCommitment = ({ day, start, end, title = "Fixed commitment" }) => ({
  id: uid("fixed"),
  day: Number(day),
  start,
  end,
  title: title.trim() || "Fixed commitment",
});

export const dayName = (day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "Day";

export const normalizeTime = (value, fallback) => (/^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : fallback);

export const toMinutes = (value) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const toTimeString = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const buildAvailabilityRulesFromProfile = (profileInput) => {
  const profile = sanitizeProfile(profileInput);
  const wake = toMinutes(profile.wakeTime);
  const sleep = toMinutes(profile.sleepTime);
  const dayEnd = sleep > wake ? sleep : wake + 60;
  return [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const blocks = profile.fixedCommitments
      .filter((item) => Number(item.day) === day)
      .map((item) => ({ start: toMinutes(item.start), end: toMinutes(item.end) }))
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start);
    let cursor = wake;
    let best = { start: wake, end: dayEnd };
    blocks.forEach((block) => {
      const gap = Math.max(0, block.start - cursor);
      if (gap > best.end - best.start) best = { start: cursor, end: block.start };
      cursor = Math.max(cursor, block.end);
    });
    if (dayEnd - cursor > best.end - best.start) best = { start: cursor, end: dayEnd };
    if (best.end <= best.start) best = { start: Math.max(wake, dayEnd - 60), end: dayEnd };
    const minutes = Math.max(60, best.end - best.start);
    const maxHours = Math.max(1, Number((minutes / 60).toFixed(1)));
    return {
      day,
      start: toTimeString(best.start),
      end: toTimeString(best.end),
      maxHours,
      maxDeepBlocks: Math.max(1, Math.min(4, Math.ceil(maxHours / 2))),
      hardBlock: false,
    };
  });
};

export const getDateForDay = (weekStart, day) => {
  const mondayDay = mondayOfWeek(weekStart);
  const offset = day === 0 ? 6 : day - 1;
  const target = new Date(mondayDay);
  target.setDate(mondayDay.getDate() + offset);
  return target;
};
