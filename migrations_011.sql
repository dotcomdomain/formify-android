-- Approvals: the business asks, the customer decides, and the answer is kept on the visit.
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_id INTEGER NOT NULL,
  kiosk_id TEXT NOT NULL,
  message_id INTEGER,
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined
  requested_by TEXT,
  requested_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS approvals_checkin ON approvals (checkin_id, status);
