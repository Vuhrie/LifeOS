import { createMajorGoalAiUi } from "./major-goal-ai-ui.js";
import { parseMajorGoalAiPlan } from "./major-goal-ai-parser.js";
import { buildMajorGoalAiPrompt } from "./major-goal-ai-prompts.js";
import { createAiMajorGoalSeed, createGoal } from "./planner-storage.js";
import { dateOnly } from "./planner-controller-helpers.js";

const buildPromptContextFromDraft = ({ ui, week, save, rerenderAll, view }) => {
  const existingSeed = [...(week.aiMajorGoalSeeds || [])].at(-1) || null;
  let selectedSeed = existingSeed;
  if (!selectedSeed) {
    const draftTitle = String(ui.goalAiTitle?.value || "").trim();
    if (draftTitle) {
      selectedSeed = createAiMajorGoalSeed({
        title: draftTitle,
        targetDate: dateOnly(ui.goalAiTargetDate?.value),
        notes: String(ui.goalAiNotes?.value || "").trim(),
      });
      week.aiMajorGoalSeeds = [...(week.aiMajorGoalSeeds || []), selectedSeed];
      ui.goalAiTitle.value = "";
      ui.goalAiTargetDate.value = "";
      ui.goalAiNotes.value = "";
      save();
      rerenderAll();
      view.setStatus("Built prompt from your current AI-assisted goal input.", "success");
    }
  }
  if (!selectedSeed) {
    throw new Error("Enter a Goal Idea first, then build the major-goal prompt.");
  }
  return buildMajorGoalAiPrompt({
    currentMajorGoals: week.goals,
    aiAssistedGoalSeeds: week.aiMajorGoalSeeds || [],
    selectedSeed,
  });
};

const applyAiPlanToGoals = ({ week, plan, save, rerenderAll }) => {
  if (plan.status === "in_progress") {
    throw new Error("Plan is still in progress. Continue AI Q&A and import final proposals_ready JSON.");
  }
  let accepted = 0;
  let rejected = 0;
  plan.proposals.forEach((proposal) => {
    const seed = (week.aiMajorGoalSeeds || []).find((item) => item.id === proposal.seedId);
    const message = [
      "AI proposal for major goal:",
      "",
      `From draft: ${seed?.title || proposal.seedId}`,
      `Title: ${proposal.title}`,
      `Deadline: ${proposal.deadline}`,
      `Importance: ${proposal.importance}`,
      `Done Condition: ${proposal.doneCondition}`,
      `Schedule Strategy: ${proposal.scheduleBuilderInstruction || "None"}`,
      `Reason: ${proposal.rationale}`,
      "",
      "Accept this major goal?",
    ].join("\n");
    const acceptedProposal = window.confirm(message);
    if (acceptedProposal) {
      week.goals.push(createGoal({
        title: proposal.title,
        deadlineIso: `${proposal.deadline}T23:59:59`,
        importance: proposal.importance,
        deadlineSource: "ai_assessed",
        source: "ai_assisted",
        doneCondition: proposal.doneCondition,
        scheduleBuilderInstruction: proposal.scheduleBuilderInstruction,
      }));
      week.aiMajorGoalSeeds = (week.aiMajorGoalSeeds || []).filter((item) => item.id !== proposal.seedId);
      accepted += 1;
      return;
    }
    const rejectConfirm = window.confirm("Reject this AI proposal and discard the linked AI-assisted draft?");
    if (rejectConfirm) {
      week.aiMajorGoalSeeds = (week.aiMajorGoalSeeds || []).filter((item) => item.id !== proposal.seedId);
    }
    rejected += 1;
  });
  save();
  rerenderAll();
  if (accepted && !rejected) return `accepted ${accepted} proposal(s)`;
  if (!accepted && rejected) return `rejected ${rejected} proposal(s)`;
  return `accepted ${accepted} proposal(s), rejected ${rejected} proposal(s)`;
};

export const createMajorGoalAiController = ({
  ui,
  view,
  getWeek,
  save,
  rerenderAll,
}) => {
  const majorGoalAiUi = createMajorGoalAiUi({
    output: ui.majorGoalAiPromptOutput,
    importInput: ui.majorGoalAiImportInput,
    status: ui.majorGoalAiStatus,
    buildButton: ui.majorGoalAiBuildPrompt,
    copyButton: ui.majorGoalAiCopyPrompt,
    validateButton: ui.majorGoalAiValidateImport,
    applyButton: ui.majorGoalAiApplyImport,
    clearButton: ui.majorGoalAiClearImport,
    onBuildPrompt: () => buildPromptContextFromDraft({ ui, week: getWeek(), save, rerenderAll, view }),
    onValidateImport: (text) =>
      parseMajorGoalAiPlan(text, {
        validSeedIds: (getWeek().aiMajorGoalSeeds || []).map((item) => item.id),
      }),
    onApplyImport: (plan) => applyAiPlanToGoals({ week: getWeek(), plan, save, rerenderAll }),
    onPersist: (next) => {
      const week = getWeek();
      week.majorGoalAiAssist = { ...week.majorGoalAiAssist, ...next };
      save();
    },
  });

  return { majorGoalAiUi };
};
