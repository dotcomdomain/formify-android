-- Rate-limit document conversion without retaining uploaded documents or extracted text.
CREATE TABLE IF NOT EXISTS document_import_limits (
  business_id TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
