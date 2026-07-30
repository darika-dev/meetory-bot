import { sql } from "../db/client.js";

export type PendingActionType =
  | "create_calendar"
  | "rename_calendar"
  | "confirm_event"
  | "edit_event"
  | "edit_event_field"
  | "event_waiting_for_calendar"
  | "calendar_join";

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
    ON CONFLICT (user_id, type)
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
    ON CONFLICT (user_id, type)
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
    ON CONFLICT (user_id, type)
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
    ON CONFLICT (user_id, type)
    DO UPDATE SET
      type = EXCLUDED.type,
      payload = EXCLUDED.payload,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
    RETURNING id, user_id, type, payload, expires_at, created_at
  ` as PendingAction[];

  return rows[0];
}

export async function upsertEventWaitingForCalendarAction(userId: string, payload: unknown, expiresAt: Date) {
  const rows = await sql`
    INSERT INTO pending_actions (
      user_id,
      type,
      payload,
      expires_at
    )
    VALUES (
      ${userId},
      'event_waiting_for_calendar',
      ${JSON.stringify(payload)},
      ${expiresAt.toISOString()}
    )
    ON CONFLICT (user_id, type)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
    RETURNING id, user_id, type, payload, expires_at, created_at
  ` as PendingAction[];

  return rows[0];
}

export async function upsertEditEventFieldAction(userId: string, payload: unknown, expiresAt: Date) {
  const rows = await sql`
    INSERT INTO pending_actions (
      user_id,
      type,
      payload,
      expires_at
    )
    VALUES (
      ${userId},
      'edit_event_field',
      ${JSON.stringify(payload)},
      ${expiresAt.toISOString()}
    )
    ON CONFLICT (user_id, type)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
    RETURNING id, user_id, type, payload, expires_at, created_at
  ` as PendingAction[];

  return rows[0];
}

export async function upsertCalendarJoinAction(userId: string, payload: unknown, expiresAt: Date) {
  const rows = await sql`
    INSERT INTO pending_actions (
      user_id,
      type,
      payload,
      expires_at
    )
    VALUES (
      ${userId},
      'calendar_join',
      ${JSON.stringify(payload)},
      ${expiresAt.toISOString()}
    )
    ON CONFLICT (user_id, type)
    DO UPDATE SET
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
    ORDER BY CASE type
      WHEN 'edit_event_field' THEN 1
      WHEN 'create_calendar' THEN 2
      WHEN 'rename_calendar' THEN 3
      WHEN 'edit_event' THEN 4
      WHEN 'confirm_event' THEN 5
      WHEN 'event_waiting_for_calendar' THEN 6
      WHEN 'calendar_join' THEN 7
      ELSE 8
    END
    LIMIT 1
  ` as PendingAction[];

  return rows[0] ?? null;
}

export async function findByUserIdAndType(userId: string, type: PendingActionType) {
  const rows = await sql`
    SELECT id, user_id, type, payload, expires_at, created_at
    FROM pending_actions
    WHERE user_id = ${userId}
      AND type = ${type}
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
