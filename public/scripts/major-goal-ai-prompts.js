import { MAJOR_GOAL_AI_TEMPLATE, MAJOR_GOAL_AI_VERSION } from "./major-goal-ai-schema.js";

const stringify = (value) => JSON.stringify(value, null, 2);

export const buildMajorGoalAiPrompt = ({
  currentMajorGoals,
  aiAssistedGoalSeeds,
  selectedSeed,
}) =>
  [
    "You are a major-goal definition assistant for LifeOS.",
    "Your scope is major goals only.",
    "",
    "Hard rules:",
    "- Do not generate minor goals.",
    "- Do not generate tasks.",
    "- Do not generate rolling schedules.",
    "- Do not generate habits or commitments.",
    "- Do not modify existing major goals directly.",
    "- If the input is too vague, return clarification questions first.",
    "",
    "Output behavior:",
    `- Use version "${MAJOR_GOAL_AI_VERSION}".`,
    '- If details are missing, return {"status":"needs_clarification","questions":[...]} with focused questions.',
    '- If details are enough, return {"status":"proposals_ready","proposals":[...]} with concrete proposals.',
    "- For proposals_ready, each proposal must include seedId, title, deadline, priority, weeklyHours, doneCondition, rationale.",
    "",
    "Context JSON:",
    stringify({
      currentMajorGoals,
      aiAssistedGoalSeeds,
      selectedSeed,
    }),
    "",
    "Return JSON only.",
    "Return this JSON shape example:",
    MAJOR_GOAL_AI_TEMPLATE,
  ].join("\n");
