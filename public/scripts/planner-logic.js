import { buildPlannerPromptContext } from "./planner-logic-context.js";
import { applyPlannerAiOperations } from "./planner-logic-apply.js";

export const createPlannerLogic = ({
  week,
  weekKey,
  save,
  rerenderAll,
  refreshAvailabilityFromProfile,
  applyUiFromState,
  writeClient,
  lastAuthStateRef,
  onGoogleContextCaptured,
}) => {
  const buildPromptContext = async () =>
    buildPlannerPromptContext({
      week,
      weekKey,
      writeClient,
      lastAuthStateRef,
      onGoogleContextCaptured,
    });

  const applyAiOperations = (plan, summaryFn) => {
    applyPlannerAiOperations({ plan, week, weekKey });
    applyUiFromState();
    refreshAvailabilityFromProfile();
    rerenderAll();
    save();
    return summaryFn(plan);
  };

  return { buildPromptContext, applyAiOperations };
};
