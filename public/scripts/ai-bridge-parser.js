import { AI_BRIDGE_VERSION } from "./ai-bridge-schema.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeTime = (value, fallback = "07:00") => {
  if (typeof value !== "string") return fallback;
  return TIME_RE.test(value) ? value : fallback;
};

const extractJson = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return "";
  return text.slice(start, end + 1);
};

const normalizeGoal = (goalInput, errors) => {
  if (!goalInput || typeof goalInput !== "object") return null;
  const title = String(goalInput.title || "").trim();
  const deadline = String(goalInput.deadline || "").trim();
  const priority = clamp(Math.round(toNumber(goalInput.priority, 3)), 1, 5);
  const weeklyHours = clamp(toNumber(goalInput.weeklyHours, 0), 0, 80);
  if (!title) errors.push("goal.title is required when goal is provided.");
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) errors.push("goal.deadline must be YYYY-MM-DD.");
  return { title, deadline, priority, weeklyHours };
};

const normalizeHabit = (value, fallbackEnabled, fallbackFrequency) => {
  if (!value || typeof value !== "object") return null;
  const source = value;
  return {
    enabled: source.enabled === undefined ? fallbackEnabled : Boolean(source.enabled),
    frequency: clamp(Math.round(toNumber(source.frequency, fallbackFrequency)), 0, 14),
  };
};

const normalizeFixedCommitments = (items, errors) => {
  if (!Array.isArray(items)) return null;
  return items
    .map((item, index) => {
      const day = clamp(Math.round(toNumber(item?.day, -1)), 0, 6);
      const start = normalizeTime(item?.start, "");
      const end = normalizeTime(item?.end, "");
      const title = String(item?.title || "Fixed commitment").trim() || "Fixed commitment";
      if (start && end && end > start) return { day, start, end, title };
      errors.push(`profile.fixedCommitments[${index}] has invalid day/time range.`);
      return null;
    })
    .filter(Boolean);
};

const normalizeAvailability = (items, errors) => {
  if (!Array.isArray(items)) return null;
  const next = items
    .map((item, index) => {
      const day = clamp(Math.round(toNumber(item?.day, -1)), 0, 6);
      const start = normalizeTime(item?.start, "");
      const end = normalizeTime(item?.end, "");
      if (!start || !end || end <= start) {
        errors.push(`availabilityRules[${index}] has invalid time range.`);
        return null;
      }
      return {
        day,
        start,
        end,
        maxHours: clamp(toNumber(item?.maxHours, 2), 1, 16),
        maxDeepBlocks: clamp(Math.round(toNumber(item?.maxDeepBlocks, 1)), 1, 8),
        hardBlock: false,
      };
    })
    .filter(Boolean);
  return next.length ? next : null;
};

const normalizeMinorGoals = (items) => {
  if (!Array.isArray(items)) return null;
  const next = items
    .map((item) => ({
      title: String(item?.title || "").trim(),
      targetHours: clamp(toNumber(item?.targetHours, 0), 0, 40),
    }))
    .filter((item) => item.title && item.targetHours > 0);
  return next;
};

const normalizeTasks = (items) => {
  if (!Array.isArray(items)) return null;
  const next = items
    .map((item) => {
      const energy = item?.energy === "light" ? "light" : "deep";
      return {
        title: String(item?.title || "").trim(),
        estimateMinutes: clamp(Math.round(toNumber(item?.estimateMinutes, 90)), 30, 480),
        priority: clamp(Math.round(toNumber(item?.priority, 3)), 1, 5),
        energy,
      };
    })
    .filter((item) => item.title);
  return next;
};

export const parseAiBridgePlan = (raw) => {
  const errors = [];
  const warnings = [];
  const json = extractJson(raw);
  if (!json) {
    return { ok: false, errors: ["No JSON block was found. Paste a JSON object or fenced ```json``` block."], warnings, plan: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["JSON parsing failed. Check commas, quotes, and brackets."], warnings, plan: null };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: ["Root payload must be a JSON object."], warnings, plan: null };
  }
  const version = String(parsed.version || AI_BRIDGE_VERSION);
  if (version !== AI_BRIDGE_VERSION) warnings.push(`Expected version ${AI_BRIDGE_VERSION}, got ${version}. Continuing with best effort.`);

  const goal = normalizeGoal(parsed.goal, errors);
  const profileSource = parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null;
  const profile = profileSource
    ? {
      wakeTime: profileSource.wakeTime === undefined ? null : normalizeTime(profileSource.wakeTime, "07:00"),
      sleepTime: profileSource.sleepTime === undefined ? null : normalizeTime(profileSource.sleepTime, "22:00"),
      fixedCommitments: normalizeFixedCommitments(profileSource.fixedCommitments, errors),
      habits: {
        gym: normalizeHabit(profileSource.habits?.gym, false, 3),
        leisure: normalizeHabit(profileSource.habits?.leisure, true, 5),
      },
    }
    : null;
  const profileHasWork = Boolean(
    profile
    && (
      profile.wakeTime
      || profile.sleepTime
      || Array.isArray(profile.fixedCommitments)
      || profile.habits.gym
      || profile.habits.leisure
    ),
  );
  const minorGoals = normalizeMinorGoals(parsed.minorGoals);
  const tasks = normalizeTasks(parsed.tasks);
  const availabilityRules = normalizeAvailability(parsed.availabilityRules, errors);
  const notes = typeof parsed.notes === "string" ? parsed.notes.trim() : "";

  const hasWork = Boolean(goal || profileHasWork || (minorGoals && minorGoals.length) || (tasks && tasks.length) || availabilityRules);
  if (!hasWork) errors.push("No supported planner sections were found. Include at least one of goal/profile/minorGoals/tasks/availabilityRules.");
  if (errors.length) return { ok: false, errors, warnings, plan: null };

  return {
    ok: true,
    errors,
    warnings,
    plan: {
      version,
      goal,
      profile: profileHasWork ? profile : null,
      minorGoals: minorGoals || [],
      tasks: tasks || [],
      availabilityRules,
      notes,
    },
  };
};

export const summarizeAiBridgePlan = (plan) => {
  const parts = [];
  if (plan.goal) parts.push("goal");
  if (plan.profile) parts.push("profile");
  if (plan.minorGoals?.length) parts.push(`${plan.minorGoals.length} minor goals`);
  if (plan.tasks?.length) parts.push(`${plan.tasks.length} tasks`);
  if (plan.availabilityRules?.length) parts.push(`${plan.availabilityRules.length} availability rules`);
  return parts.length ? parts.join(", ") : "no changes";
};
