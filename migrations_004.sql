CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT,
  ticket TEXT,
  at INTEGER NOT NULL,
  ack_at INTEGER
);
CREATE INDEX IF NOT EXISTS alerts_kiosk ON alerts (kiosk_id, at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kiosk_id TEXT NOT NULL,
  type TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_kiosk ON events (kiosk_id, type, at);
ALTER TABLE checkins ADD COLUMN amount_cents INTEGER;
ALTER TABLE checkins ADD COLUMN paid_at INTEGER;
ALTER TABLE checkins ADD COLUMN pay_method TEXT;
