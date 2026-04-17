export const AI_BRIDGE_VERSION = "3.1";

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
  "version": "3.1",
  "status": "in_progress",
  "questions": [
    "Should lunch be explicitly shown on days with free midday capacity?",
    "Do you want visible free-time blocks on heavy commitment days?"
  ],
  "assumptions": [
    "Long commitments may contain internal lunch unless split commitments are provided."
  ],
  "concerns": [
    "Several days are high load with limited recovery time."
  ],
  "workingPlan": {
    "minorGoals": [],
    "tasks": [],
    "rollingPlan": []
  }
}
\`\`\`

\`\`\`json
{
  "version": "3.1",
  "status": "schedule_ready",
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
        { "type": "necessity", "title": "Lunch", "start": "12:15", "end": "13:00" },
        { "type": "commitment", "title": "Course", "start": "09:00", "end": "18:00" },
        { "type": "rest", "title": "Decompress", "start": "18:00", "end": "18:45" },
        { "type": "free_time", "title": "Free Time", "start": "18:45", "end": "19:30" },
        { "type": "task", "title": "Review chapter 1 notes", "start": "19:00", "end": "20:00", "minorGoalTitle": "Complete module fundamentals" }
      ]
    }
  ]
}
\`\`\``;
