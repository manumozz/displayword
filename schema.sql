-- DisplayWord D1 schema additions (apply via Cloudflare D1 console when noted in assignments).

-- #118 (21.08.2026): счёт скачиваний установщиков — страна/город, БЕЗ IP
-- CREATE TABLE download_log (id TEXT PRIMARY KEY, ts TEXT NOT NULL, file TEXT NOT NULL, country TEXT, city TEXT);  -- применено 21.08.2026

-- #117 (21.08.2026): вписка роли при «Другое»
-- ALTER TABLE users ADD COLUMN role_custom TEXT;  -- применено 21.08.2026

CREATE TABLE IF NOT EXISTS key_access_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id        TEXT NOT NULL,
  action        TEXT NOT NULL,            -- 'reveal' | 'resend' | 'issue_email' | 'revoke' | 'delete'
  admin_user_id TEXT,
  admin_email   TEXT,
  recipient     TEXT,                     -- куда ушло письмо; для 'reveal' NULL
  ip            TEXT,
  at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_key_access_log_key ON key_access_log(key_id, at);

-- #050 geography (apply once in D1 console before deploying code that uses these columns)
ALTER TABLE applications ADD COLUMN country TEXT;   -- ISO 3166-1 alpha-2
ALTER TABLE license_keys ADD COLUMN country TEXT;   -- ISO 3166-1 alpha-2
ALTER TABLE activations  ADD COLUMN country TEXT;   -- страна активации по CF-IPCountry

-- #058 recipient email on license key (apply once via wrangler d1 --remote with author OK)
ALTER TABLE license_keys ADD COLUMN recipient_email TEXT;
-- optional backfill from audit log (separate command, author OK required):
-- UPDATE license_keys SET recipient_email = (
--   SELECT recipient FROM key_access_log l
--   WHERE l.key_id = license_keys.key_id
--     AND l.recipient IS NOT NULL
--     AND l.action IN ('issue_email','resend')
--   ORDER BY l.at DESC LIMIT 1
-- ) WHERE recipient_email IS NULL;

-- #062 edition on license key (connect | team); apply once via wrangler d1 --remote with author OK
ALTER TABLE license_keys ADD COLUMN edition TEXT;

-- #105 профиль пользователя (apply once via wrangler d1 --remote with author OK)
ALTER TABLE users ADD COLUMN display_name       TEXT;  -- как обращаться, до 80 символов
ALTER TABLE users ADD COLUMN community_name     TEXT;  -- название собрания, до 120
ALTER TABLE users ADD COLUMN city               TEXT;  -- город, до 80
ALTER TABLE users ADD COLUMN country            TEXT;  -- ISO 3166-1 alpha-2
ALTER TABLE users ADD COLUMN role               TEXT;  -- pastor|worship|operator|sound|other
ALTER TABLE users ADD COLUMN profile_updated_at TEXT;  -- ISO 8601, когда профиль трогали
