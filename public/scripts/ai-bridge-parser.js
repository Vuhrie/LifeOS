import { AI_BRIDGE_VERSION } from "./ai-bridge-schema.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_OPS = new Set([
  "setProfile",
  "setHorizon",
  "replaceGoals",
  "replaceHabits",
  "replaceCommitments",
  "replaceTasks",
  "replaceAvailabilityRules",
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toNumber = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const normTime = (value, fallback) => (TIME_RE.test(String(value || "")) ? String(value) : fallback);

const extractJson = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
};

const parseProfile = (value) => ({
  wakeTime: value?.wakeTime ? normTime(value.wakeTime, "07:00") : null,
  sleepTime: value?.sleepTime ? normTime(value.sleepTime, "22:00") : null,
  habits: value?.habits && typeof value.habits === "object" ? value.habits : null,
  necessities: value?.necessities && typeof value.necessities === "object" ? value.necessities : null,
});

const parseGoals = (items, errors) =>
  (Array.isArray(items) ? items : []).map((item, index) => {
    const title = String(item?.title || "").trim();
    const deadline = String(item?.deadline || "").trim();
    const priority = clamp(Math.round(toNumber(item?.priority, 3)), 1, 5);
    const weeklyHours = clamp(toNumber(item?.weeklyHours, 8), 1, 80);
    if (!title) errors.push(`replaceGoals.items[${index}] requires title.`);
    if (deadline && !DATE_RE.test(deadline)) errors.push(`replaceGoals.items[${index}] deadline must be YYYY-MM-DD.`);
    return { title, deadline, priority, weeklyHours };
  });

const parseHabits = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(item?.name || "").trim(),
      frequency: clamp(Math.round(toNumber(item?.frequency, 3)), 0, 21),
      durationMinutes: clamp(Math.round(toNumber(item?.durationMinutes, 60)), 15, 240),
      window: ["morning", "afternoon", "evening", "night", "any"].includes(item?.window) ? item.window : "any",
    }))
    .filter((item) => item.name);

const parseCommitments = (items, errors) =>
  (Array.isArray(items) ? items : []).map((item, index) => {
    const mode = ["weekly_recurring", "date_range_recurring", "one_off"].includes(item?.mode) ? item.mode : "weekly_recurring";
    const start = normTime(item?.start, "");
    const end = normTime(item?.end, "");
    const startDate = String(item?.startDate || "");
    const endDate = String(item?.endDate || "");
    const date = String(item?.date || "");
    if (!start || !end || end <= start) errors.push(`replaceCommitments.items[${index}] has invalid time range.`);
    if (mode === "date_range_recurring" && (!DATE_RE.test(startDate) || !DATE_RE.test(endDate))) errors.push(`replaceCommitments.items[${index}] requires startDate/endDate.`);
    if (mode === "one_off" && !DATE_RE.test(date)) errors.push(`replaceCommitments.items[${index}] requires date.`);
    return {
      mode,
      title: String(item?.title || "Static commitment").trim() || "Static commitment",
      startDate,
      endDate,
      date,
      days: Array.isArray(item?.days) ? item.days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [],
      start,
      end,
    };
  });

const parseTasks = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: String(item?.title || "").trim(),
      estimateMinutes: clamp(Math.round(toNumber(item?.estimateMinutes, 90)), 30, 480),
      priority: clamp(Math.round(toNumber(item?.priority, 3)), 1, 5),
      energy: item?.energy === "light" ? "light" : "deep",
    }))
    .filter((item) => item.title);

const parseAvailability = (items, errors) =>
  (Array.isArray(items) ? items : []).map((item, index) => {
    const start = normTime(item?.start, "");
    const end = normTime(item?.end, "");
    if (!start || !end || end <= start) errors.push(`replaceAvailabilityRules.items[${index}] has invalid time range.`);
    return {
      day: clamp(Math.round(toNumber(item?.day, 1)), 0, 6),
      start,
      end,
      maxHours: clamp(toNumber(item?.maxHours, 2), 1, 16),
      maxDeepBlocks: clamp(Math.round(toNumber(item?.maxDeepBlocks, 2)), 1, 8),
      hardBlock: false,
    };
  });

export const parseAiBridgePlan = (raw) => {
  const errors = [];
  const warnings = [];
  const json = extractJson(raw);
  if (!json) return { ok: false, errors: ["No JSON found. Paste JSON object output."], warnings, plan: null };
  let parsed = null;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["JSON parsing failed. Check syntax."], warnings, plan: null };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: ["Root payload must be an object."], warnings, plan: null };
  }
  const version = String(parsed.version || AI_BRIDGE_VERSION);
  if (version !== AI_BRIDGE_VERSION) warnings.push(`Expected version ${AI_BRIDGE_VERSION}, got ${version}.`);
  const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
  if (!operations.length) return { ok: false, errors: ["operations[] is required."], warnings, plan: null };

  const normalizedOps = operations
    .map((operation, index) => {
      const op = String(operation?.op || "");
      if (!ALLOWED_OPS.has(op)) {
        errors.push(`operations[${index}].op is not supported.`);
        return null;
      }
      switch (op) {
        case "setProfile":
          return { op, value: parseProfile(operation.value || {}) };
        case "setHorizon":
          return {
            op,
            value: {
              horizonDays: clamp(Math.round(toNumber(operation.value?.horizonDays, 7)), 1, 14),
              lockedHorizonHours: clamp(Math.round(toNumber(operation.value?.lockedHorizonHours, 12)), 0, 48),
            },
          };
        case "replaceGoals":
          return { op, items: parseGoals(operation.items, errors) };
        case "replaceHabits":
          return { op, items: parseHabits(operation.items) };
        case "replaceCommitments":
          return { op, items: parseCommitments(operation.items, errors) };
        case "replaceTasks":
          return { op, items: parseTasks(operation.items) };
        case "replaceAvailabilityRules":
          return { op, items: parseAvailability(operation.items, errors) };
        default:
          return null;
      }
    })
    .filter(Boolean);

  if (errors.length) return { ok: false, errors, warnings, plan: null };
  return {
    ok: true,
    errors: [],
    warnings,
    plan: {
      version,
      operations: normalizedOps,
      notes: typeof parsed.notes === "string" ? parsed.notes.trim() : "",
    },
  };
};

export const summarizeAiBridgePlan = (plan) => `${plan.operations.length} operations`;
