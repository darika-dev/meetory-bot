import { sql } from "../db/client.js";

export type User = {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  language: string | null;
  active_calendar_id: string | null;
  created_at: Date;
};

export type UserProfileInput = {
  telegramId: string;
  telegramUsername?: string;
  firstName?: string;
  lastName?: string;
  language?: string;
};

export async function findByTelegramId(telegramId: string) {
  const rows = await sql`
    SELECT id, telegram_id, telegram_username, first_name, last_name, language, active_calendar_id, created_at
    FROM users
    WHERE telegram_id = ${telegramId}
    LIMIT 1
  ` as User[];

  return rows[0] ?? null;
}

export async function findById(id: string) {
  const rows = await sql`
    SELECT id, telegram_id, telegram_username, first_name, last_name, language, active_calendar_id, created_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  ` as User[];

  return rows[0] ?? null;
}

export async function upsertTelegramUser(input: UserProfileInput) {
  const rows = await sql`
    INSERT INTO users (
      telegram_id,
      telegram_username,
      first_name,
      last_name,
      language
    )
    VALUES (
      ${input.telegramId},
      ${input.telegramUsername ?? null},
      ${input.firstName ?? null},
      ${input.lastName ?? null},
      ${input.language ?? null}
    )
    ON CONFLICT (telegram_id)
    DO UPDATE SET
      telegram_username = EXCLUDED.telegram_username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      language = COALESCE(users.language, EXCLUDED.language)
    RETURNING id, telegram_id, telegram_username, first_name, last_name, language, active_calendar_id, created_at
  ` as User[];

  return rows[0];
}

export async function create(input: UserProfileInput) {
  return upsertTelegramUser(input);
}

export async function updateProfile(telegramId: string, input: Omit<UserProfileInput, "telegramId">) {
  const rows = await sql`
    UPDATE users
    SET
      telegram_username = ${input.telegramUsername ?? null},
      first_name = ${input.firstName ?? null},
      last_name = ${input.lastName ?? null},
      language = ${input.language ?? null}
    WHERE telegram_id = ${telegramId}
    RETURNING id, telegram_id, telegram_username, first_name, last_name, language, active_calendar_id, created_at
  ` as User[];

  return rows[0] ?? null;
}

export async function setActiveCalendar(userId: string, calendarId: string) {
  const rows = await sql`
    UPDATE users
    SET active_calendar_id = ${calendarId}
    WHERE id = ${userId}
    RETURNING id, telegram_id, telegram_username, first_name, last_name, language, active_calendar_id, created_at
  ` as User[];

  return rows[0] ?? null;
}

export async function setLanguage(userId: string, language: string) {
  const rows = await sql`
    UPDATE users
    SET language = ${language}
    WHERE id = ${userId}
    RETURNING id, telegram_id, telegram_username, first_name, last_name, language, active_calendar_id, created_at
  ` as User[];

  return rows[0] ?? null;
}

export async function clearActiveCalendar(calendarId: string) {
  await sql`
    UPDATE users
    SET active_calendar_id = NULL
    WHERE active_calendar_id = ${calendarId}
  `;
}

export async function clearActiveCalendarByCalendarId(calendarId: string) {
  return clearActiveCalendar(calendarId);
}

export async function chooseFallbackActiveCalendar(userId: string) {
  const rows = await sql`
    WITH fallback AS (
      SELECT calendars.id
      FROM calendar_members
      INNER JOIN calendars ON calendars.id = calendar_members.calendar_id
      WHERE calendar_members.user_id = ${userId}
      ORDER BY calendar_members.joined_at ASC, calendars.created_at ASC
      LIMIT 1
    )
    UPDATE users
    SET active_calendar_id = (SELECT id FROM fallback)
    WHERE users.id = ${userId}
    RETURNING id, telegram_id, telegram_username, first_name, last_name, language, active_calendar_id, created_at
  ` as User[];

  return rows[0] ?? null;
}
