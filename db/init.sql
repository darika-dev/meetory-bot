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
  encrypted_refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendars (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  google_calendar_id TEXT NOT NULL UNIQUE,
  google_connection_id BIGINT NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_members (
  calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (calendar_id, user_id),
  UNIQUE (calendar_id, user_id)
);

CREATE INDEX IF NOT EXISTS google_connections_user_id_idx
  ON google_connections(user_id);

CREATE INDEX IF NOT EXISTS calendars_google_connection_id_idx
  ON calendars(google_connection_id);

CREATE INDEX IF NOT EXISTS calendars_created_by_user_id_idx
  ON calendars(created_by_user_id);

CREATE INDEX IF NOT EXISTS calendar_members_user_id_idx
  ON calendar_members(user_id);
