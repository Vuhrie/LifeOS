import { getPlanningWeekKey, normalizeTime } from "./planner-time.js";

const STORAGE_KEY = "lifeos_planner_state_v1";

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const defaultProfile = () => ({
  wakeTime: "07:00",
  sleepTime: "22:00",
  fixedCommitments: [],
  staticCommitments: [],
  necessities: {
    breakfast: { enabled: true, durationMinutes: 30 },
    dinner: { enabled: true, durationMinutes: 45 },
    shower: { enabled: true, durationMinutes: 20 },
  },
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
  settings: {
    horizonDays: 7,
    lockedHorizonHours: 12,
  },
  minorGoals: [],
  tasks: [],
  availabilityRules: defaultAvailability(),
  draft: null,
  commitLog: [],
  managedSlots: [],
  planRuns: [],
  aiAssist: {
    lastPrompt: "",
    lastImportText: "",
    lastAppliedAt: "",
    lastApplySummary: "",
  },
});

const defaultState = () => ({
  schemaVersion: 4,
  goals: [],
  currentWeekKey: "",
  weeks: {},
  history: [],
});

const parse = (raw, fallback) => (raw && typeof raw === "object" ? raw : fallback);

const sanitizeProfile = (profile) => {
  const next = parse(profile, {});
  const habits = parse(next.habits, {});
  const necessities = parse(next.necessities, {});
  const sanitizeNeed = (value, fallbackDuration) => {
    const item = parse(value, {});
    return {
      enabled: item.enabled !== false,
      durationMinutes: Math.max(10, Math.min(120, Number(item.durationMinutes || fallbackDuration))),
    };
  };
  const staticCommitments = Array.isArray(next.staticCommitments)
    ? next.staticCommitments.filter((item) => item && typeof item === "object").map((item) => ({
      id: typeof item.id === "string" ? item.id : uid("static"),
      title: String(item.title || "Static commitment").trim() || "Static commitment",
      startDate: String(item.startDate || ""),
      endDate: String(item.endDate || ""),
      days: Array.isArray(item.days)
        ? item.days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
      start: normalizeTime(item.start, "09:00"),
      end: normalizeTime(item.end, "18:00"),
    }))
    : [];
  return {
    wakeTime: normalizeTime(next.wakeTime, "07:00"),
    sleepTime: normalizeTime(next.sleepTime, "22:00"),
    fixedCommitments: Array.isArray(next.fixedCommitments) ? next.fixedCommitments : [],
    staticCommitments,
    necessities: {
      breakfast: sanitizeNeed(necessities.breakfast, 30),
      dinner: sanitizeNeed(necessities.dinner, 45),
      shower: sanitizeNeed(necessities.shower, 20),
    },
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
    settings: {
      horizonDays: Math.max(1, Math.min(14, Number(parse(normalized.settings, {}).horizonDays || 7))),
      lockedHorizonHours: Math.max(0, Math.min(48, Number(parse(normalized.settings, {}).lockedHorizonHours || 12))),
    },
    minorGoals: Array.isArray(normalized.minorGoals) ? normalized.minorGoals : [],
    tasks: Array.isArray(normalized.tasks) ? normalized.tasks : [],
    availabilityRules: Array.isArray(normalized.availabilityRules) && normalized.availabilityRules.length
      ? normalized.availabilityRules
      : defaultAvailability(),
    draft: normalized.draft || null,
    commitLog: Array.isArray(normalized.commitLog) ? normalized.commitLog : [],
    managedSlots: Array.isArray(normalized.managedSlots) ? normalized.managedSlots : [],
    planRuns: Array.isArray(normalized.planRuns) ? normalized.planRuns : [],
    aiAssist: {
      lastPrompt: String(parse(normalized.aiAssist, {}).lastPrompt || ""),
      lastImportText: String(parse(normalized.aiAssist, {}).lastImportText || ""),
      lastAppliedAt: String(parse(normalized.aiAssist, {}).lastAppliedAt || ""),
      lastApplySummary: String(parse(normalized.aiAssist, {}).lastApplySummary || ""),
    },
  };
};

export const loadPlannerState = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultState();
    const state = {
      schemaVersion: 4,
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

export const createStaticCommitment = ({
  title,
  startDate,
  endDate,
  days,
  start,
  end,
}) => ({
  id: uid("static"),
  title: (String(title || "Static commitment").trim() || "Static commitment"),
  startDate: String(startDate || ""),
  endDate: String(endDate || ""),
  days: Array.isArray(days) ? days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [],
  start: normalizeTime(start, "09:00"),
  end: normalizeTime(end, "18:00"),
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
