CREATE TABLE IF NOT EXISTS planner_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
