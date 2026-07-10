import { sql } from "../db/client.ts";

export type GoogleConnection = {
  id: string;
  user_id: string;
  google_email: string;
  encrypted_refresh_token: string;
  created_at: Date;
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
    RETURNING id, user_id, google_email, encrypted_refresh_token, created_at
  ` as GoogleConnection[];

  return rows[0];
}

export async function update(id: string, input: Pick<GoogleConnectionInput, "googleEmail" | "encryptedRefreshToken">) {
  const rows = await sql`
    UPDATE google_connections
    SET
      google_email = ${input.googleEmail},
      encrypted_refresh_token = ${input.encryptedRefreshToken}
    WHERE id = ${id}
    RETURNING id, user_id, google_email, encrypted_refresh_token, created_at
  ` as GoogleConnection[];

  return rows[0] ?? null;
}

export async function findByUser(userId: string) {
  const rows = await sql`
    SELECT id, user_id, google_email, encrypted_refresh_token, created_at
    FROM google_connections
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  ` as GoogleConnection[];

  return rows;
}
