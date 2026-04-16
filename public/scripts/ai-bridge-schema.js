export const AI_BRIDGE_VERSION = "3.0";

export const AI_BRIDGE_SCHEMA = Object.freeze({
  root: "object",
  fields: [
    "minorGoals",
    "tasks",
    "rollingPlan",
  ],
});

export const AI_BRIDGE_MINIMAL_TEMPLATE = `\`\`\`json
{
  "version": "3.0",
  "minorGoals": [
    { "majorGoalId": "goal_1", "title": "Complete module fundamentals", "deadline": "2026-05-01", "status": "active" }
  ],
  "tasks": [
    { "minorGoalTitle": "Complete module fundamentals", "title": "Review chapter 1 notes", "estimateMinutes": 60, "energy": "deep", "status": "scheduled" }
  ],
  "rollingPlan": [
    {
      "date": "2026-04-17",
      "items": [
        { "type": "necessity", "title": "Breakfast", "start": "07:00", "end": "07:30" },
        { "type": "commitment", "title": "Course", "start": "09:00", "end": "18:00" },
        { "type": "task", "title": "Review chapter 1 notes", "start": "19:00", "end": "20:00", "minorGoalTitle": "Complete module fundamentals" }
      ]
    }
  ]
}
\`\`\``;
