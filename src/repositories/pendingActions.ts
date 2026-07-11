import { sql } from "../db/client.js";

export type PendingActionType = "create_calendar";

export type PendingAction = {
  id: string;
  user_id: string;
  type: PendingActionType;
  payload: unknown | null;
  expires_at: Date;
  created_at: Date;
};

export async function upsertCreateCalendarAction(userId: string, expiresAt: Date) {
  const rows = await sql`
    INSERT INTO pending_actions (
      user_id,
      type,
      payload,
      expires_at
    )
    VALUES (
      ${userId},
      'create_calendar',
      NULL,
      ${expiresAt.toISOString()}
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      type = EXCLUDED.type,
      payload = EXCLUDED.payload,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
    RETURNING id, user_id, type, payload, expires_at, created_at
  ` as PendingAction[];

  return rows[0];
}

export async function findByUserId(userId: string) {
  const rows = await sql`
    SELECT id, user_id, type, payload, expires_at, created_at
    FROM pending_actions
    WHERE user_id = ${userId}
    LIMIT 1
  ` as PendingAction[];

  return rows[0] ?? null;
}

export async function deleteByUserId(userId: string) {
  await sql`
    DELETE FROM pending_actions
    WHERE user_id = ${userId}
  `;
}
