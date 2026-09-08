-- Explicitly consented client reports only. Ordinary chat is never persisted.
CREATE TABLE IF NOT EXISTS companion_feedback (
  feedback_id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  categories_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'resolved', 'dismissed')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_companion_feedback_created
  ON companion_feedback(created_at DESC, feedback_id DESC);
CREATE INDEX IF NOT EXISTS idx_companion_feedback_rating_created
  ON companion_feedback(rating, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_feedback_status_created
  ON companion_feedback(status, created_at DESC);
