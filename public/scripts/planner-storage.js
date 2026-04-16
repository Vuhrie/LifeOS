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
    morningShower: { enabled: true, durationMinutes: 20 },
    nightShower: { enabled: true, durationMinutes: 20 },
  },
});

const defaultWeekState = () => ({
  profile: defaultProfile(),
  settings: { horizonDays: 7, lockedHorizonHours: 12 },
  goals: [],
  minorGoals: [],
  habits: [],
  tasks: [],
  aiPlannerInputs: {
    notes: "",
    changedSinceLastRun: "",
    taskProgressNotes: "",
    priorityMajorGoalId: "",
  },
  availabilityRules: [],
  draft: null,
  commitLog: [],
  managedSlots: [],
  ignoredGoogleEventIds: [],
  dismissedGoogleCommitmentIds: [],
  importedEventEdits: {},
  planRuns: [],
  aiAssist: { lastPrompt: "", lastImportText: "", lastAppliedAt: "", lastApplySummary: "" },
});

const defaultState = () => ({ schemaVersion: 10, currentWeekKey: "", weeks: {}, history: [] });

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
  const legacyShower = normalizeNeed(parse(next.necessities, {}).shower, 20);
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
        googleEventId: String(item.googleEventId || ""),
      })),
    necessities: {
      breakfast: normalizeNeed(parse(next.necessities, {}).breakfast, 30),
      dinner: normalizeNeed(parse(next.necessities, {}).dinner, 45),
      morningShower: normalizeNeed(parse(next.necessities, {}).morningShower, legacyShower.durationMinutes),
      nightShower: normalizeNeed(parse(next.necessities, {}).nightShower, legacyShower.durationMinutes),
    },
  };
};

const normalizeWeekState = (week) => {
  const next = parse(week, defaultWeekState());
  const profile = normalizeProfile(next.profile);
  const goals = Array.isArray(next.goals)
    ? next.goals.map((item) => ({
      id: String(item?.id || uid("goal")),
      title: String(item?.title || "").trim(),
      deadlineIso: String(item?.deadlineIso || ""),
      priority: Math.max(1, Math.min(5, Number(item?.priority || 3))),
      weeklyHours: Math.max(1, Math.min(80, Number(item?.weeklyHours || 8))),
      status: String(item?.status || "active"),
      deadlineSource: String(item?.deadlineSource || "manual"),
      createdAt: String(item?.createdAt || new Date().toISOString()),
      source: String(item?.source || "manual"),
    })).filter((item) => item.title)
    : [];
  const minorGoals = Array.isArray(next.minorGoals)
    ? next.minorGoals.map((item) => ({
      id: String(item?.id || uid("mgoal")),
      majorGoalId: String(item?.majorGoalId || ""),
      title: String(item?.title || "").trim(),
      deadlineIso: String(item?.deadlineIso || ""),
      status: String(item?.status || "active"),
      notes: String(item?.notes || ""),
      source: String(item?.source || "ai"),
      createdAt: String(item?.createdAt || new Date().toISOString()),
      updatedAt: String(item?.updatedAt || new Date().toISOString()),
    })).filter((item) => item.title)
    : [];
  const tasks = Array.isArray(next.tasks)
    ? next.tasks.map((item) => ({
      id: String(item?.id || uid("task")),
      weekKey: String(item?.weekKey || ""),
      title: String(item?.title || "").trim(),
      estimateMinutes: Math.max(15, Math.min(480, Number(item?.estimateMinutes || 60))),
      priority: Math.max(1, Math.min(5, Number(item?.priority || 3))),
      energy: item?.energy === "light" ? "light" : "deep",
      habitId: String(item?.habitId || ""),
      preferredWindow: String(item?.preferredWindow || ""),
      majorGoalId: String(item?.majorGoalId || ""),
      minorGoalId: String(item?.minorGoalId || ""),
      status: String(item?.status || "active"),
      source: String(item?.source || "ai"),
      updatedAt: String(item?.updatedAt || new Date().toISOString()),
    })).filter((item) => item.title)
    : [];
  return {
    profile,
    settings: {
      horizonDays: Math.max(1, Math.min(14, Number(parse(next.settings, {}).horizonDays || 7))),
      lockedHorizonHours: Math.max(0, Math.min(48, Number(parse(next.settings, {}).lockedHorizonHours || 12))),
    },
    goals,
    minorGoals,
    habits: Array.isArray(next.habits) ? next.habits : [],
    tasks,
    aiPlannerInputs: {
      notes: String(parse(next.aiPlannerInputs, {}).notes || ""),
      changedSinceLastRun: String(parse(next.aiPlannerInputs, {}).changedSinceLastRun || ""),
      taskProgressNotes: String(parse(next.aiPlannerInputs, {}).taskProgressNotes || ""),
      priorityMajorGoalId: String(parse(next.aiPlannerInputs, {}).priorityMajorGoalId || ""),
    },
    availabilityRules: Array.isArray(next.availabilityRules) ? next.availabilityRules : [],
    draft: next.draft || null,
    commitLog: Array.isArray(next.commitLog) ? next.commitLog : [],
    managedSlots: Array.isArray(next.managedSlots) ? next.managedSlots : [],
    ignoredGoogleEventIds: Array.isArray(next.ignoredGoogleEventIds)
      ? next.ignoredGoogleEventIds.map((item) => String(item || "")).filter(Boolean)
      : [],
    dismissedGoogleCommitmentIds: Array.isArray(next.dismissedGoogleCommitmentIds)
      ? next.dismissedGoogleCommitmentIds.map((item) => String(item || "")).filter(Boolean)
      : [],
    importedEventEdits: parse(next.importedEventEdits, {}),
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
    const state = { schemaVersion: 10, currentWeekKey: String(parsed.currentWeekKey || ""), weeks: {}, history: Array.isArray(parsed.history) ? parsed.history : [] };
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

export const createGoal = ({
  title,
  deadlineIso = "",
  priority = 3,
  weeklyHours = 8,
  deadlineSource = "manual",
}) => ({
  id: uid("goal"),
  title,
  deadlineIso,
  priority,
  weeklyHours,
  status: "active",
  deadlineSource,
  createdAt: new Date().toISOString(),
});
export const createHabit = ({ name, frequency, durationMinutes, window }) => ({ id: uid("habit"), name, frequency, durationMinutes, window, status: "active" });
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

export { buildAvailabilityRulesFromProfile, dayName, getDateForDay, getPlanningWeekKey, getWeekKey, getWeekStartFromKey, normalizeTime, toMinutes } from "./planner-time.js";
