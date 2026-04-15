import { getPlannerUi } from "./planner-dom.js";
import { initPlannerController } from "./planner-controller.js";

const ui = getPlannerUi();
initPlannerController(ui);

