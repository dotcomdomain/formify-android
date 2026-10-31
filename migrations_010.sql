-- A remote check-in holds its place in a walk-in line, so the line sorts on line_at instead of arrival time.
ALTER TABLE checkins ADD COLUMN line_at INTEGER;
UPDATE checkins SET line_at = COALESCE(arrived_at, created_at) WHERE line_at IS NULL;
CREATE INDEX IF NOT EXISTS checkins_line ON checkins (kiosk_id, line_at);

-- Fixed-window request counts. Keys are hashes that change each window, so no IP address is stored.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
