export const AI_BRIDGE_VERSION = "1.0";

export const AI_BRIDGE_SCHEMA = Object.freeze({
  root: "object",
  fields: [
    "goal",
    "profile",
    "minorGoals",
    "tasks",
    "availabilityRules",
    "notes",
  ],
});

export const AI_BRIDGE_MINIMAL_TEMPLATE = `{
  "version": "1.0",
  "goal": {
    "title": "Your primary weekly goal",
    "deadline": "2026-04-30",
    "priority": 4,
    "weeklyHours": 8
  },
  "profile": {
    "wakeTime": "07:00",
    "sleepTime": "22:00",
    "fixedCommitments": [
      { "day": 1, "start": "09:00", "end": "18:00", "title": "Class" }
    ],
    "habits": {
      "gym": { "enabled": true, "frequency": 3 },
      "leisure": { "enabled": true, "frequency": 5 }
    }
  },
  "minorGoals": [
    { "title": "Course revision", "targetHours": 4 }
  ],
  "tasks": [
    { "title": "Review lecture notes", "estimateMinutes": 90, "priority": 3, "energy": "light" }
  ],
  "availabilityRules": [
    { "day": 1, "start": "19:00", "end": "22:00", "maxHours": 3, "maxDeepBlocks": 2 }
  ],
  "notes": "Optional reasoning text."
}`;

