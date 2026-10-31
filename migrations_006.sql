-- Logins become members of a business. The owner's member id equals the business id,
-- so existing owner sessions keep working.
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS members_business ON members (business_id);
INSERT OR IGNORE INTO members (id, business_id, email, name, role, pass_hash, salt, created_at)
  SELECT id, id, email, name, 'owner', pass_hash, salt, created_at FROM businesses;
ALTER TABLE checkins ADD COLUMN stripe_session TEXT;
