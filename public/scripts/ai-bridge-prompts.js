import { AI_BRIDGE_MINIMAL_TEMPLATE, AI_BRIDGE_VERSION } from "./ai-bridge-schema.js";

const stringify = (value) => JSON.stringify(value, null, 2);

export const buildAiBridgePrompt = (context) => {
  return [
    "You are a planning assistant for LifeOS.",
    "Produce modifications only. Do not rewrite everything.",
    "Return JSON only, no markdown, no prose.",
    `Set "version" to "${AI_BRIDGE_VERSION}" and use patch operations.`,
    "",
    "Planning context JSON:",
    stringify({
      scheduleContext: context.scheduleContext,
      policy: context.policy,
      current: {
        goals: context.current?.goals || context.goals || [],
        habits: context.current?.habits || context.habits || [],
        commitments: context.current?.commitments || context.commitments || [],
        profile: context.profile,
        settings: context.settings,
        tasks: context.tasks,
        availabilityRules: context.availabilityRules,
        managedSlots: context.managedSlots,
      },
    }),
    "",
    "Hard requirements:",
    "- Keep times in 24h HH:MM.",
    "- Use only these op values: setProfile, setHorizon, replaceGoals, replaceHabits, replaceCommitments, replaceTasks, replaceAvailabilityRules.",
    "- For days use 1=Mon ... 0=Sun.",
    "- Keep outputs realistic given hard blocks, necessity blocks, and policy.",
    "- Prefer small changes that improve current plan quality and minimize churn.",
    "",
    "Return this JSON shape:",
    AI_BRIDGE_MINIMAL_TEMPLATE,
  ].join("\n");
};
