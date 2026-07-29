import { sql } from "../db/client.js";

export type PendingActionType = "create_calendar" | "rename_calendar" | "confirm_event" | "edit_event";

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

export async function upsertRenameCalendarAction(userId: string, calendarId: string, expiresAt: Date) {
  const rows = await sql`
    INSERT INTO pending_actions (
      user_id,
      type,
      payload,
      expires_at
    )
    VALUES (
      ${userId},
      'rename_calendar',
      ${JSON.stringify({ calendarId })},
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

export async function upsertConfirmEventAction(userId: string, payload: unknown, expiresAt: Date) {
  const rows = await sql`
    INSERT INTO pending_actions (
      user_id,
      type,
      payload,
      expires_at
    )
    VALUES (
      ${userId},
      'confirm_event',
      ${JSON.stringify(payload)},
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

export async function upsertEditEventAction(userId: string, expiresAt: Date) {
  const rows = await sql`
    INSERT INTO pending_actions (
      user_id,
      type,
      payload,
      expires_at
    )
    VALUES (
      ${userId},
      'edit_event',
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

export async function updateConfirmEventPayload(userId: string, payload: unknown) {
  const rows = await sql`
    UPDATE pending_actions
    SET payload = ${JSON.stringify(payload)}
    WHERE user_id = ${userId}
      AND type = 'confirm_event'
    RETURNING id, user_id, type, payload, expires_at, created_at
  ` as PendingAction[];

  return rows[0] ?? null;
}

export async function markConfirmEventProcessing(userId: string, draftId: string) {
  const rows = await sql`
    UPDATE pending_actions
    SET payload = jsonb_set(payload::jsonb, '{status}', '"processing"', true)
    WHERE user_id = ${userId}
      AND type = 'confirm_event'
      AND expires_at > NOW()
      AND payload::jsonb ->> 'draftId' = ${draftId}
      AND COALESCE(payload::jsonb ->> 'status', 'ready') = 'ready'
    RETURNING id, user_id, type, payload, expires_at, created_at
  ` as PendingAction[];

  return rows[0] ?? null;
}

export async function resetConfirmEventProcessing(userId: string, draftId: string) {
  const rows = await sql`
    UPDATE pending_actions
    SET payload = jsonb_set(payload::jsonb, '{status}', '"ready"', true)
    WHERE user_id = ${userId}
      AND type = 'confirm_event'
      AND payload::jsonb ->> 'draftId' = ${draftId}
      AND COALESCE(payload::jsonb ->> 'status', 'ready') = 'processing'
    RETURNING id, user_id, type, payload, expires_at, created_at
  ` as PendingAction[];

  return rows[0] ?? null;
}

export async function deleteConfirmEventByDraftId(userId: string, draftId: string) {
  await sql`
    DELETE FROM pending_actions
    WHERE user_id = ${userId}
      AND type = 'confirm_event'
      AND payload::jsonb ->> 'draftId' = ${draftId}
  `;
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

export async function deleteByUserIdAndType(userId: string, type: PendingActionType) {
  await sql`
    DELETE FROM pending_actions
    WHERE user_id = ${userId}
      AND type = ${type}
  `;
}
