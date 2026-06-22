CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewed_at TEXT NOT NULL,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer_host TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_views_day ON page_views(day);
CREATE INDEX IF NOT EXISTS idx_page_views_path_day ON page_views(path, day);
CREATE INDEX IF NOT EXISTS idx_page_views_referrer_day ON page_views(referrer_host, day);
