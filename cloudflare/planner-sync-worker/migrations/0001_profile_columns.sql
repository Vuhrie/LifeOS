ALTER TABLE planner_profiles ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE planner_profiles ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE planner_profiles ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';

UPDATE planner_profiles
SET
  created_at = updated_at,
  last_seen_at = updated_at
WHERE created_at = '1970-01-01T00:00:00.000Z'
  OR last_seen_at = '1970-01-01T00:00:00.000Z';

CREATE TABLE IF NOT EXISTS planner_sync_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT "",
  created_at TEXT NOT NULL
);
