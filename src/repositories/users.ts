import { sql } from "../db/client.js";

export type User = {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  language: string | null;
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
    SELECT id, telegram_id, telegram_username, first_name, last_name, language, created_at
    FROM users
    WHERE telegram_id = ${telegramId}
    LIMIT 1
  ` as User[];

  return rows[0] ?? null;
}

export async function findById(id: string) {
  const rows = await sql`
    SELECT id, telegram_id, telegram_username, first_name, last_name, language, created_at
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
      language = EXCLUDED.language
    RETURNING id, telegram_id, telegram_username, first_name, last_name, language, created_at
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
    RETURNING id, telegram_id, telegram_username, first_name, last_name, language, created_at
  ` as User[];

  return rows[0] ?? null;
}
