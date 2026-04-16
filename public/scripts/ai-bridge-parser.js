import { AI_BRIDGE_VERSION } from "./ai-bridge-schema.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_OPS = new Set([
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
const safeText = (value) => String(value || "").trim();
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

const parseLegacyOperations = (parsed, errors) => {
  const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
  if (!operations.length) {
    errors.push("operations[] is required for legacy patch format.");
    return null;
  }
  const normalizedOps = operations
    .map((operation, index) => {
      const op = safeText(operation?.op);
      if (!LEGACY_OPS.has(op)) {
        errors.push(`operations[${index}].op is not supported.`);
        return null;
      }
      return operation;
    })
    .filter(Boolean);
  return {
    kind: "legacy_v2",
    version: safeText(parsed.version) || "2.0",
    operations: normalizedOps,
    notes: safeText(parsed.notes),
  };
};

const parseMinorGoals = (items, errors) =>
  (Array.isArray(items) ? items : []).map((item, index) => {
    const title = safeText(item?.title);
    const majorGoalId = safeText(item?.majorGoalId);
    const majorGoalTitle = safeText(item?.majorGoalTitle);
    const deadline = safeText(item?.deadline);
    const status = ["not_started", "active", "blocked", "done"].includes(item?.status)
      ? item.status
      : "active";
    if (!title) errors.push(`minorGoals[${index}] requires title.`);
    if (!majorGoalId && !majorGoalTitle) errors.push(`minorGoals[${index}] requires majorGoalId or majorGoalTitle.`);
    if (deadline && !DATE_RE.test(deadline)) errors.push(`minorGoals[${index}] deadline must be YYYY-MM-DD.`);
    return {
      id: safeText(item?.id),
      title,
      majorGoalId,
      majorGoalTitle,
      deadline,
      status,
      notes: safeText(item?.notes),
    };
  });

const parseTasks = (items, errors) =>
  (Array.isArray(items) ? items : []).map((item, index) => {
    const title = safeText(item?.title);
    const minorGoalId = safeText(item?.minorGoalId);
    const minorGoalTitle = safeText(item?.minorGoalTitle);
    const estimateMinutes = clamp(Math.round(toNumber(item?.estimateMinutes, 60)), 15, 480);
    const energy = item?.energy === "light" ? "light" : "deep";
    const status = ["not_started", "scheduled", "done", "skipped", "blocked", "active"].includes(item?.status)
      ? item.status
      : "not_started";
    if (!title) errors.push(`tasks[${index}] requires title.`);
    if (!minorGoalId && !minorGoalTitle) errors.push(`tasks[${index}] requires minorGoalId or minorGoalTitle.`);
    return {
      id: safeText(item?.id),
      title,
      minorGoalId,
      minorGoalTitle,
      estimateMinutes,
      energy,
      status,
      notes: safeText(item?.notes),
    };
  });

const parseRollingPlan = (days, errors) =>
  (Array.isArray(days) ? days : []).map((day, dayIndex) => {
    const date = safeText(day?.date);
    if (!DATE_RE.test(date)) errors.push(`rollingPlan[${dayIndex}].date must be YYYY-MM-DD.`);
    const items = (Array.isArray(day?.items) ? day.items : []).map((item, itemIndex) => {
      const type = ["commitment", "necessity", "habit", "task", "minor_goal"].includes(item?.type)
        ? item.type
        : "task";
      const title = safeText(item?.title);
      const start = normTime(item?.start, "");
      const end = normTime(item?.end, "");
      if (!title) errors.push(`rollingPlan[${dayIndex}].items[${itemIndex}] requires title.`);
      if (!start || !end || end <= start) errors.push(`rollingPlan[${dayIndex}].items[${itemIndex}] has invalid time range.`);
      return {
        type,
        title,
        start,
        end,
        sourceId: safeText(item?.sourceId),
        majorGoalId: safeText(item?.majorGoalId),
        majorGoalTitle: safeText(item?.majorGoalTitle),
        minorGoalId: safeText(item?.minorGoalId),
        minorGoalTitle: safeText(item?.minorGoalTitle),
        taskId: safeText(item?.taskId),
      };
    });
    return { date, items };
  });

const parseV3Plan = (parsed, errors) => {
  const minorGoals = parseMinorGoals(parsed.minorGoals, errors);
  const tasks = parseTasks(parsed.tasks, errors);
  const rollingPlan = parseRollingPlan(parsed.rollingPlan, errors);
  if (!rollingPlan.length) errors.push("rollingPlan[] is required.");
  return {
    kind: "rolling_v3",
    version: safeText(parsed.version) || AI_BRIDGE_VERSION,
    minorGoals,
    tasks,
    rollingPlan,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(safeText).filter(Boolean) : [],
    questionsForUser: Array.isArray(parsed.questionsForUser) ? parsed.questionsForUser.map(safeText).filter(Boolean) : [],
  };
};

export const parseAiBridgePlan = (raw) => {
  const errors = [];
  const warnings = [];
  const json = extractJson(raw);
  if (!json) return { ok: false, errors: ["No JSON found. Paste JSON output."], warnings, plan: null };

  let parsed = null;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["JSON parsing failed. Check syntax."], warnings, plan: null };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: ["Root payload must be an object."], warnings, plan: null };
  }

  const version = safeText(parsed.version);
  if (version && version !== AI_BRIDGE_VERSION && version !== "2.0") {
    warnings.push(`Expected version ${AI_BRIDGE_VERSION} (or legacy 2.0), got ${version}.`);
  }

  const plan = Array.isArray(parsed.operations)
    ? parseLegacyOperations(parsed, errors)
    : parseV3Plan(parsed, errors);

  if (!plan || errors.length) return { ok: false, errors, warnings, plan: null };
  return { ok: true, errors: [], warnings, plan };
};

export const summarizeAiBridgePlan = (plan) => {
  if (plan.kind === "rolling_v3") {
    return `${plan.minorGoals.length} minor goals, ${plan.tasks.length} tasks, ${plan.rollingPlan.length} rolling days`;
  }
  return `${plan.operations.length} operations`;
};
