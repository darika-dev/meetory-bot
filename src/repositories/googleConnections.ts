import { sql } from "../db/client.js";

export type GoogleConnection = {
  id: string;
  user_id: string;
  google_email: string;
  encrypted_refresh_token: string;
  created_at: Date;
  updated_at: Date;
};

export type GoogleConnectionInput = {
  userId: string;
  googleEmail: string;
  encryptedRefreshToken: string;
};

export async function create(input: GoogleConnectionInput) {
  const rows = await sql`
    INSERT INTO google_connections (
      user_id,
      google_email,
      encrypted_refresh_token
    )
    VALUES (
      ${input.userId},
      ${input.googleEmail},
      ${input.encryptedRefreshToken}
    )
    RETURNING id, user_id, google_email, encrypted_refresh_token, created_at, updated_at
  ` as GoogleConnection[];

  return rows[0];
}

export async function update(id: string, input: Pick<GoogleConnectionInput, "googleEmail" | "encryptedRefreshToken">) {
  const rows = await sql`
    UPDATE google_connections
    SET
      google_email = ${input.googleEmail},
      encrypted_refresh_token = ${input.encryptedRefreshToken},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, user_id, google_email, encrypted_refresh_token, created_at, updated_at
  ` as GoogleConnection[];

  return rows[0] ?? null;
}

export async function findByUser(userId: string) {
  const rows = await sql`
    SELECT id, user_id, google_email, encrypted_refresh_token, created_at, updated_at
    FROM google_connections
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  ` as GoogleConnection[];

  return rows;
}

export async function findByUserId(userId: string) {
  const rows = await sql`
    SELECT id, user_id, google_email, encrypted_refresh_token, created_at, updated_at
    FROM google_connections
    WHERE user_id = ${userId}
    LIMIT 1
  ` as GoogleConnection[];

  return rows[0] ?? null;
}

export async function upsert(input: GoogleConnectionInput) {
  const rows = await sql`
    INSERT INTO google_connections (
      user_id,
      google_email,
      encrypted_refresh_token
    )
    VALUES (
      ${input.userId},
      ${input.googleEmail},
      ${input.encryptedRefreshToken}
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      google_email = EXCLUDED.google_email,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      updated_at = NOW()
    RETURNING id, user_id, google_email, encrypted_refresh_token, created_at, updated_at
  ` as GoogleConnection[];

  return rows[0];
}

export async function updateEmail(userId: string, googleEmail: string) {
  const rows = await sql`
    UPDATE google_connections
    SET
      google_email = ${googleEmail},
      updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING id, user_id, google_email, encrypted_refresh_token, created_at, updated_at
  ` as GoogleConnection[];

  return rows[0] ?? null;
}

export async function deleteByUserId(userId: string) {
  await sql`
    DELETE FROM google_connections
    WHERE user_id = ${userId}
  `;
}
