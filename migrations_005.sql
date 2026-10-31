CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  profile TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_subject ON sessions (kind, subject_id);
ALTER TABLE kiosks ADD COLUMN owner_id TEXT;
ALTER TABLE checkins ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS kiosks_owner ON kiosks (owner_id);
CREATE INDEX IF NOT EXISTS checkins_user ON checkins (user_id, created_at);
