-- Visit thread: every update and message between a customer and a business for one visit.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_id INTEGER NOT NULL,
  kiosk_id TEXT NOT NULL,
  sender TEXT NOT NULL,          -- customer | business | system
  author TEXT,                   -- staff member name for business messages
  kind TEXT NOT NULL DEFAULT 'text', -- text | status | receipt | rating
  body TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_checkin ON messages (checkin_id, at);
ALTER TABLE checkins ADD COLUMN seen_customer INTEGER DEFAULT 0;
ALTER TABLE checkins ADD COLUMN seen_business INTEGER DEFAULT 0;
-- Customer data requests (access is instant; deletion goes to the business).
ALTER TABLE checkins ADD COLUMN delete_status TEXT;
ALTER TABLE checkins ADD COLUMN delete_note TEXT;
ALTER TABLE checkins ADD COLUMN delete_at INTEGER;
-- Integrations: webhook to the business's own systems.
ALTER TABLE businesses ADD COLUMN webhook_url TEXT;
ALTER TABLE businesses ADD COLUMN webhook_secret TEXT;
