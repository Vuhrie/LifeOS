export const MAJOR_GOAL_AI_VERSION = "major-goals-v1";

export const MAJOR_GOAL_AI_TEMPLATE = `\`\`\`json
{
  "version": "major-goals-v1",
  "status": "in_progress",
  "seedId": "seed_1",
  "known": {
    "title": "Preparation for SIT Information Security",
    "targetDate": "",
    "importance": null,
    "doneCondition": "",
    "rationale": ""
  },
  "missing": [
    "targetDate",
    "importance",
    "doneCondition"
  ],
  "questions": [
    "What is your expected matriculation date?"
  ]
}
\`\`\`

\`\`\`json
{
  "version": "major-goals-v1",
  "status": "proposals_ready",
  "proposals": [
    {
      "seedId": "seed_1",
      "title": "Pass CEH certification exam",
      "deadline": "2026-06-30",
      "importance": 4,
      "doneCondition": "Pass CEH exam with valid result.",
      "rationale": "Turns a vague cybersecurity goal into a measurable target."
    }
  ]
}
\`\`\``;
