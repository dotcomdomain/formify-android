-- Public business page: one per business, listing all its forms.
ALTER TABLE businesses ADD COLUMN slug TEXT;
ALTER TABLE businesses ADD COLUMN profile TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS businesses_slug ON businesses (slug);
