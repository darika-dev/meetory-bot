import { sql } from "../db/client.js";

export type UserSettings = {
  user_id: string;
  tomorrow_digest_enabled: boolean;
  tomorrow_digest_time: string;
  weekend_digest_enabled: boolean;
  weekend_digest_weekday: number;
  weekend_digest_time: string;
  created_at: Date;
  updated_at: Date;
};

const SETTINGS_FIELDS = sql`
  user_id,
  tomorrow_digest_enabled,
  tomorrow_digest_time,
  weekend_digest_enabled,
  weekend_digest_weekday,
  weekend_digest_time,
  created_at,
  updated_at
`;

export async function getOrCreate(userId: string) {
  const rows = await sql`
    INSERT INTO user_settings (user_id)
    VALUES (${userId})
    ON CONFLICT (user_id)
    DO UPDATE SET updated_at = user_settings.updated_at
    RETURNING ${SETTINGS_FIELDS}
  ` as UserSettings[];

  return rows[0];
}

export async function updateTomorrowDigest(input: {
  userId: string;
  enabled?: boolean;
  time?: string;
}) {
  const current = await getOrCreate(input.userId);
  const rows = await sql`
    UPDATE user_settings
    SET
      tomorrow_digest_enabled = ${input.enabled ?? current.tomorrow_digest_enabled},
      tomorrow_digest_time = ${input.time ?? current.tomorrow_digest_time},
      updated_at = NOW()
    WHERE user_id = ${input.userId}
    RETURNING ${SETTINGS_FIELDS}
  ` as UserSettings[];

  return rows[0];
}

export async function updateWeekendDigest(input: {
  userId: string;
  enabled?: boolean;
  weekday?: number;
  time?: string;
}) {
  const current = await getOrCreate(input.userId);
  const rows = await sql`
    UPDATE user_settings
    SET
      weekend_digest_enabled = ${input.enabled ?? current.weekend_digest_enabled},
      weekend_digest_weekday = ${input.weekday ?? current.weekend_digest_weekday},
      weekend_digest_time = ${input.time ?? current.weekend_digest_time},
      updated_at = NOW()
    WHERE user_id = ${input.userId}
    RETURNING ${SETTINGS_FIELDS}
  ` as UserSettings[];

  return rows[0];
}
