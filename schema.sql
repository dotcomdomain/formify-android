CREATE TABLE IF NOT EXISTS kiosks (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  ticket TEXT NOT NULL,
  answers TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at INTEGER NOT NULL,
  served_at INTEGER
);
CREATE INDEX IF NOT EXISTS checkins_kiosk ON checkins (kiosk_id, created_at);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_kiosk ON audit (kiosk_id, at);
-- Added in migrations_002.sql (phone check-in, handoff notes):
-- token, code, channel, language, summary, flags, arrived_at on checkins.
