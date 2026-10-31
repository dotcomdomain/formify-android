-- Email invites: a business sends a customer a personal link to a form.
CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  kiosk_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'created', -- created | sent | opened
  created_by TEXT,
  created_at INTEGER NOT NULL,
  opened_at INTEGER
);
CREATE INDEX IF NOT EXISTS invites_kiosk ON invites (kiosk_id, created_at);
