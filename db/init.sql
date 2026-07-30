CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE google_connections
  ALTER COLUMN encrypted_refresh_token DROP NOT NULL;

ALTER TABLE google_connections
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'connected';

ALTER TABLE google_connections
  ALTER COLUMN status SET DEFAULT 'connected';

UPDATE google_connections
SET status = 'connected'
WHERE status IS NULL;

ALTER TABLE google_connections
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'google_connections_status_check'
  ) THEN
    ALTER TABLE google_connections
      ADD CONSTRAINT google_connections_status_check
      CHECK (status IN ('connected', 'disconnected'));
  END IF;
END $$;

ALTER TABLE google_connections
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS calendars (
  id BIGSERIAL PRIMARY KEY,
  -- Legacy cache only. Google Calendar API is the source of truth for display metadata.
  name TEXT NOT NULL,
  google_calendar_id TEXT NOT NULL UNIQUE,
  google_connection_id BIGINT REFERENCES google_connections(id) ON DELETE SET NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE calendars
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE calendars
  ALTER COLUMN google_connection_id DROP NOT NULL;

ALTER TABLE calendars
  DROP CONSTRAINT IF EXISTS calendars_google_connection_id_fkey;

ALTER TABLE calendars
  ADD CONSTRAINT calendars_google_connection_id_fkey
  FOREIGN KEY (google_connection_id)
  REFERENCES google_connections(id)
  ON DELETE SET NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_calendar_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_active_calendar_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_active_calendar_id_fkey
      FOREIGN KEY (active_calendar_id)
      REFERENCES calendars(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar_members (
  calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (calendar_id, user_id),
  UNIQUE (calendar_id, user_id)
);

ALTER TABLE calendar_members
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE calendar_members
SET role = 'member'
FROM calendars
WHERE calendar_members.calendar_id = calendars.id
  AND calendar_members.role = 'owner'
  AND calendar_members.user_id <> calendars.created_by_user_id;

INSERT INTO calendar_members (
  calendar_id,
  user_id,
  role
)
SELECT
  calendars.id,
  calendars.created_by_user_id,
  'owner'
FROM calendars
ON CONFLICT (calendar_id, user_id)
DO UPDATE SET role = 'owner';

CREATE TABLE IF NOT EXISTS pending_actions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_actions
  DROP CONSTRAINT IF EXISTS pending_actions_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS pending_actions_user_id_type_unique_idx
  ON pending_actions(user_id, type);

CREATE TABLE IF NOT EXISTS processed_telegram_updates (
  update_id BIGINT PRIMARY KEY,
  update_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  error_code TEXT NULL
);

CREATE TABLE IF NOT EXISTS event_source_claims (
  idempotency_key TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  error_code TEXT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tomorrow_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  tomorrow_digest_time TEXT NOT NULL DEFAULT '19:00',
  weekend_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  weekend_digest_weekday SMALLINT NOT NULL DEFAULT 4,
  weekend_digest_time TEXT NOT NULL DEFAULT '19:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_weekend_digest_weekday_check
    CHECK (weekend_digest_weekday BETWEEN 1 AND 7)
);

CREATE TABLE IF NOT EXISTS calendar_invites (
  id BIGSERIAL PRIMARY KEY,
  calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NULL
);

ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS user_settings_tomorrow_digest_time_check;

ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_tomorrow_digest_time_check
  CHECK (tomorrow_digest_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS user_settings_weekend_digest_time_check;

ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_weekend_digest_time_check
  CHECK (weekend_digest_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

CREATE INDEX IF NOT EXISTS google_connections_user_id_idx
  ON google_connections(user_id);

DROP INDEX IF EXISTS google_connections_user_id_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS google_connections_user_id_google_email_unique_idx
  ON google_connections(user_id, google_email);

CREATE INDEX IF NOT EXISTS calendars_google_connection_id_idx
  ON calendars(google_connection_id);

CREATE INDEX IF NOT EXISTS calendars_created_by_user_id_idx
  ON calendars(created_by_user_id);

CREATE INDEX IF NOT EXISTS calendar_members_user_id_idx
  ON calendar_members(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_members_one_owner_per_calendar_idx
  ON calendar_members(calendar_id)
  WHERE role = 'owner';

CREATE INDEX IF NOT EXISTS users_active_calendar_id_idx
  ON users(active_calendar_id);

CREATE INDEX IF NOT EXISTS pending_actions_expires_at_idx
  ON pending_actions(expires_at);

CREATE INDEX IF NOT EXISTS processed_telegram_updates_created_at_idx
  ON processed_telegram_updates(created_at);

CREATE INDEX IF NOT EXISTS processed_telegram_updates_expires_at_idx
  ON processed_telegram_updates(expires_at);

CREATE INDEX IF NOT EXISTS event_source_claims_user_id_idx
  ON event_source_claims(user_id);

CREATE INDEX IF NOT EXISTS user_settings_updated_at_idx
  ON user_settings(updated_at);

CREATE INDEX IF NOT EXISTS calendar_invites_calendar_id_idx
  ON calendar_invites(calendar_id);

CREATE INDEX IF NOT EXISTS calendar_invites_active_calendar_idx
  ON calendar_invites(calendar_id)
  WHERE revoked_at IS NULL;
