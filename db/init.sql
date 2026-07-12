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
  PRIMARY KEY (calendar_id, user_id),
  UNIQUE (calendar_id, user_id)
);

CREATE TABLE IF NOT EXISTS pending_actions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

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

CREATE INDEX IF NOT EXISTS users_active_calendar_id_idx
  ON users(active_calendar_id);

CREATE INDEX IF NOT EXISTS pending_actions_expires_at_idx
  ON pending_actions(expires_at);
