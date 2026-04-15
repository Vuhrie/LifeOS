import { AI_BRIDGE_MINIMAL_TEMPLATE, AI_BRIDGE_VERSION } from "./ai-bridge-schema.js";

const stringify = (value) => JSON.stringify(value, null, 2);

export const buildAiBridgePrompt = (context) => {
  const goal = {
    title: context.goal.title || "",
    deadline: context.goal.deadline || "",
    priority: context.goal.priority,
    weeklyHours: context.goal.weeklyHours,
  };

  const profile = {
    wakeTime: context.profile.wakeTime,
    sleepTime: context.profile.sleepTime,
    fixedCommitments: context.profile.fixedCommitments,
    habits: context.profile.habits,
  };

  return [
    "You are helping me plan my week for LifeOS using deterministic constraints.",
    "Return only JSON (no prose) and follow the exact structure below.",
    `Set "version" to "${AI_BRIDGE_VERSION}".`,
    "",
    "Current context:",
    stringify({
      weekKey: context.weekKey,
      goal,
      profile,
      existingMinorGoals: context.minorGoals,
      existingTasks: context.tasks,
      existingAvailabilityRules: context.availabilityRules,
    }),
    "",
    "Output requirements:",
    "- Keep times in 24h HH:MM format.",
    "- Use day index: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun.",
    "- Set task energy to \"deep\" or \"light\".",
    "- Keep output grounded and realistic to current constraints.",
    "",
    "Response JSON template:",
    AI_BRIDGE_MINIMAL_TEMPLATE,
  ].join("\n");
};

