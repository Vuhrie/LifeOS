import { getPlanningWeekKey, normalizeTime } from "./planner-time.js";

const STORAGE_KEY_PREFIX = "lifeos_planner_state_v2";
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const parse = (raw, fallback) => (raw && typeof raw === "object" ? raw : fallback);

const defaultProfile = () => ({
  wakeTime: "06:00",
  sleepTime: "22:00",
  commitments: [],
  necessities: {
    breakfast: { enabled: true, durationMinutes: 30 },
    dinner: { enabled: true, durationMinutes: 45 },
    shower: { enabled: true, durationMinutes: 20 },
  },
});

const defaultWeekState = () => ({
  profile: defaultProfile(),
  settings: { horizonDays: 7, lockedHorizonHours: 12 },
  goals: [],
  habits: [],
  tasks: [],
  availabilityRules: [],
  draft: null,
  commitLog: [],
  managedSlots: [],
  planRuns: [],
  aiAssist: { lastPrompt: "", lastImportText: "", lastAppliedAt: "", lastApplySummary: "" },
});

const defaultState = () => ({ schemaVersion: 7, currentWeekKey: "", weeks: {}, history: [] });

const normalizeNeed = (value, fallbackDuration) => {
  const item = parse(value, {});
  return { enabled: item.enabled !== false, durationMinutes: Math.max(10, Math.min(120, Number(item.durationMinutes || fallbackDuration))) };
};

const migrateLegacyCommitments = (profile) => {
  const fixed = Array.isArray(profile.fixedCommitments) ? profile.fixedCommitments : [];
  const staticCommitments = Array.isArray(profile.staticCommitments) ? profile.staticCommitments : [];
  const merged = [
    ...fixed.map((item) => ({
      id: item.id || uid("commit"),
      mode: "weekly_recurring",
      title: String(item.title || "Commitment"),
      start: normalizeTime(item.start, "09:00"),
      end: normalizeTime(item.end, "18:00"),
      days: [Number(item.day)],
      startDate: "",
      endDate: "",
      date: "",
      isLocked: true,
      source: "manual",
    })),
    ...staticCommitments.map((item) => ({
      id: item.id || uid("commit"),
      mode: "date_range_recurring",
      title: String(item.title || "Commitment"),
      start: normalizeTime(item.start, "09:00"),
      end: normalizeTime(item.end, "18:00"),
      days: Array.isArray(item.days) ? item.days.map(Number).filter((day) => day >= 0 && day <= 6) : [1, 2, 3, 4, 5],
      startDate: String(item.startDate || ""),
      endDate: String(item.endDate || ""),
      date: "",
      isLocked: true,
      source: "manual",
    })),
  ];
  return merged;
};

const normalizeProfile = (profile) => {
  const next = parse(profile, {});
  const commitmentsRaw = Array.isArray(next.commitments) ? next.commitments : migrateLegacyCommitments(next);
  return {
    wakeTime: normalizeTime(next.wakeTime, "06:00"),
    sleepTime: normalizeTime(next.sleepTime, "22:00"),
    commitments: commitmentsRaw
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || uid("commit")),
        mode: ["weekly_recurring", "date_range_recurring", "one_off"].includes(item.mode) ? item.mode : "weekly_recurring",
        title: String(item.title || "Commitment").trim() || "Commitment",
        start: normalizeTime(item.start, "09:00"),
        end: normalizeTime(item.end, "18:00"),
        days: Array.isArray(item.days) ? item.days.map(Number).filter((day) => day >= 0 && day <= 6) : [],
        startDate: String(item.startDate || ""),
        endDate: String(item.endDate || ""),
        date: String(item.date || ""),
        isLocked: item.isLocked !== false,
        source: String(item.source || "manual"),
      })),
    necessities: {
      breakfast: normalizeNeed(parse(next.necessities, {}).breakfast, 30),
      dinner: normalizeNeed(parse(next.necessities, {}).dinner, 45),
      shower: normalizeNeed(parse(next.necessities, {}).shower, 20),
    },
  };
};

const normalizeWeekState = (week) => {
  const next = parse(week, defaultWeekState());
  return {
    profile: normalizeProfile(next.profile),
    settings: {
      horizonDays: Math.max(1, Math.min(14, Number(parse(next.settings, {}).horizonDays || 7))),
      lockedHorizonHours: Math.max(0, Math.min(48, Number(parse(next.settings, {}).lockedHorizonHours || 12))),
    },
    goals: Array.isArray(next.goals) ? next.goals : [],
    habits: Array.isArray(next.habits) ? next.habits : [],
    tasks: Array.isArray(next.tasks) ? next.tasks : [],
    availabilityRules: Array.isArray(next.availabilityRules) ? next.availabilityRules : [],
    draft: next.draft || null,
    commitLog: Array.isArray(next.commitLog) ? next.commitLog : [],
    managedSlots: Array.isArray(next.managedSlots) ? next.managedSlots : [],
    planRuns: Array.isArray(next.planRuns) ? next.planRuns : [],
    aiAssist: {
      lastPrompt: String(parse(next.aiAssist, {}).lastPrompt || ""),
      lastImportText: String(parse(next.aiAssist, {}).lastImportText || ""),
      lastAppliedAt: String(parse(next.aiAssist, {}).lastAppliedAt || ""),
      lastApplySummary: String(parse(next.aiAssist, {}).lastApplySummary || ""),
    },
  };
};

const getStorageKey = (accountKey) => `${STORAGE_KEY_PREFIX}_${accountKey || "anon"}`;

export const loadPlannerState = (accountKey = "anon") => {
  try {
    const raw = window.localStorage.getItem(getStorageKey(accountKey));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultState();
    const state = { schemaVersion: 7, currentWeekKey: String(parsed.currentWeekKey || ""), weeks: {}, history: Array.isArray(parsed.history) ? parsed.history : [] };
    Object.entries(parse(parsed.weeks, {})).forEach(([key, value]) => { state.weeks[key] = normalizeWeekState(value); });
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
  state.history.push({ weekKey: state.currentWeekKey, archivedAt: new Date().toISOString(), snapshot: state.weeks[state.currentWeekKey] || defaultWeekState() });
  state.currentWeekKey = nextWeekKey;
  ensureWeekState(state, nextWeekKey);
  return nextWeekKey;
};

export const createGoal = ({ title, deadlineIso, priority, weeklyHours }) => ({ id: uid("goal"), title, deadlineIso, priority, weeklyHours, status: "active", createdAt: new Date().toISOString() });
export const createHabit = ({ name, frequency, durationMinutes, window }) => ({ id: uid("habit"), name, frequency, durationMinutes, window, status: "active" });
export const createTask = ({ weekKey, title, estimateMinutes, priority, energy }) => ({ id: uid("task"), weekKey, title, estimateMinutes, priority, energy, status: "active" });
export const createMinorGoal = ({ weekKey, title, targetHours }) => ({ id: uid("mgoal"), weekKey, title, targetHours, status: "active" });
export const createCommitment = ({ mode, title, start, end, days, startDate, endDate, date }) => ({ id: uid("commit"), mode, title, start, end, days: days || [], startDate: startDate || "", endDate: endDate || "", date: date || "", isLocked: true, source: "manual" });

export { buildAvailabilityRulesFromProfile, dayName, getDateForDay, getPlanningWeekKey, getWeekKey, getWeekStartFromKey, normalizeTime, toMinutes } from "./planner-time.js";

