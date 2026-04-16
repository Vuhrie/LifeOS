export const AI_BRIDGE_VERSION = "2.0";

export const AI_BRIDGE_SCHEMA = Object.freeze({
  root: "object",
  fields: [
    "operations",
  ],
});

export const AI_BRIDGE_MINIMAL_TEMPLATE = `\`\`\`json
{
  "version": "2.0",
  "operations": [
    { "op": "replaceGoals", "items": [{ "title": "Pass ML module", "deadline": "2026-05-15", "priority": 4, "weeklyHours": 10 }] },
    { "op": "setHorizon", "value": { "horizonDays": 7, "lockedHorizonHours": 12 } },
    { "op": "replaceCommitments", "items": [{ "mode": "date_range_recurring", "title": "Course", "startDate": "2026-04-20", "endDate": "2026-06-30", "days": [1,2,3,4,5], "start": "09:00", "end": "18:00" }] },
    { "op": "replaceHabits", "items": [{ "name": "Gym", "frequency": 3, "durationMinutes": 60, "window": "morning" }] },
    { "op": "replaceTasks", "items": [{ "title": "Review lecture notes", "estimateMinutes": 90, "priority": 3, "energy": "light" }] }
  ]
}
\`\`\``;
