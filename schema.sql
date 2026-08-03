-- DisplayWord D1 schema additions (apply via Cloudflare D1 console when noted in assignments).

CREATE TABLE IF NOT EXISTS key_access_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id        TEXT NOT NULL,
  action        TEXT NOT NULL,            -- 'reveal' | 'resend' | 'issue_email'
  admin_user_id TEXT,
  admin_email   TEXT,
  recipient     TEXT,                     -- куда ушло письмо; для 'reveal' NULL
  ip            TEXT,
  at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_key_access_log_key ON key_access_log(key_id, at);
