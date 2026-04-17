import { MAJOR_GOAL_AI_VERSION } from "./major-goal-ai-schema.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const safeText = (value) => String(value || "").trim();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const extractJson = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
};

const parseProposal = (proposal, index, errors) => {
  const seedId = safeText(proposal?.seedId);
  const title = safeText(proposal?.title);
  const deadline = safeText(proposal?.deadline);
  const doneCondition = safeText(proposal?.doneCondition);
  const rationale = safeText(proposal?.rationale);
  const scheduleBuilderInstruction = safeText(proposal?.scheduleBuilderInstruction);
  const importanceRaw = Number(proposal?.importance ?? proposal?.priority);
  const importance = Number.isFinite(importanceRaw) ? clamp(Math.round(importanceRaw), 1, 5) : NaN;
  if (!seedId) errors.push(`proposals[${index}].seedId is required.`);
  if (!title) errors.push(`proposals[${index}].title is required.`);
  if (!deadline || !DATE_RE.test(deadline)) errors.push(`proposals[${index}].deadline must be YYYY-MM-DD.`);
  if (!Number.isFinite(importanceRaw)) errors.push(`proposals[${index}].importance is required.`);
  if (!doneCondition) errors.push(`proposals[${index}].doneCondition is required.`);
  if (!rationale) errors.push(`proposals[${index}].rationale is required.`);
  return {
    seedId,
    title,
    deadline,
    importance: Number.isFinite(importance) ? importance : 3,
    // Mirror importance for legacy paths that still read priority.
    priority: Number.isFinite(importance) ? importance : 3,
    doneCondition,
    rationale,
    scheduleBuilderInstruction,
  };
};

export const parseMajorGoalAiPlan = (raw, { validSeedIds = [] } = {}) => {
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
  if (version !== MAJOR_GOAL_AI_VERSION) {
    warnings.push(`Expected version ${MAJOR_GOAL_AI_VERSION}, got ${version || "missing"}.`);
  }
  if (json.includes('"weeklyHours"')) {
    warnings.push("weeklyHours is no longer used for major goals and was ignored.");
  }

  const status = safeText(parsed.status);
  if (status !== "in_progress" && status !== "proposals_ready" && status !== "needs_clarification") {
    errors.push('status must be "in_progress" or "proposals_ready".');
  }

  if (status === "in_progress" || status === "needs_clarification") {
    const questions = Array.isArray(parsed.questions) ? parsed.questions.map(safeText).filter(Boolean) : [];
    if (!questions.length) errors.push("in_progress requires questions[].");
    const knownRaw = (parsed.known && typeof parsed.known === "object" && !Array.isArray(parsed.known)) ? parsed.known : {};
    const known = {
      title: safeText(knownRaw.title),
      targetDate: safeText(knownRaw.targetDate),
      importance: Number.isFinite(Number(knownRaw.importance ?? knownRaw.priority))
        ? clamp(Math.round(Number(knownRaw.importance ?? knownRaw.priority)), 1, 5)
        : null,
      doneCondition: safeText(knownRaw.doneCondition),
      rationale: safeText(knownRaw.rationale),
    };
    const missing = Array.isArray(parsed.missing) ? parsed.missing.map(safeText).filter(Boolean) : [];
    const plan = {
      kind: "major_goal_ai_v1",
      version: version || MAJOR_GOAL_AI_VERSION,
      status: "in_progress",
      seedId: safeText(parsed.seedId),
      workingUnderstanding: safeText(parsed.workingUnderstanding),
      questions,
      known,
      missing,
      proposals: [],
    };
    return errors.length ? { ok: false, errors, warnings, plan: null } : { ok: true, errors: [], warnings, plan };
  }

  const proposalsRaw = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  if (!proposalsRaw.length) errors.push("proposals_ready requires proposals[].");
  const proposals = proposalsRaw.map((proposal, index) => parseProposal(proposal, index, errors));
  const seedSet = new Set((validSeedIds || []).map((item) => String(item || "")));
  proposals.forEach((proposal, index) => {
    if (seedSet.size && !seedSet.has(proposal.seedId)) {
      errors.push(`proposals[${index}].seedId does not match an existing AI-assisted major-goal draft.`);
    }
  });
  const plan = {
    kind: "major_goal_ai_v1",
    version: version || MAJOR_GOAL_AI_VERSION,
    status: "proposals_ready",
    seedId: safeText(parsed.seedId),
    workingUnderstanding: safeText(parsed.workingUnderstanding),
    questions: [],
    proposals,
  };
  return errors.length ? { ok: false, errors, warnings, plan: null } : { ok: true, errors: [], warnings, plan };
};

export const summarizeMajorGoalAiPlan = (plan) => {
  if (!plan) return "No plan";
  if (plan.status === "in_progress") return `${plan.questions.length} question(s) pending`;
  return `${plan.proposals.length} major-goal proposal(s)`;
};
