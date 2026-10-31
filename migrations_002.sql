ALTER TABLE checkins ADD COLUMN token TEXT;
ALTER TABLE checkins ADD COLUMN code TEXT;
ALTER TABLE checkins ADD COLUMN channel TEXT;
ALTER TABLE checkins ADD COLUMN language TEXT;
ALTER TABLE checkins ADD COLUMN summary TEXT;
ALTER TABLE checkins ADD COLUMN flags TEXT;
ALTER TABLE checkins ADD COLUMN arrived_at INTEGER;
CREATE INDEX IF NOT EXISTS checkins_token ON checkins (token);
