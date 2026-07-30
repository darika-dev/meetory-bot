import { sql } from "../db/client.js";

export type CalendarInvite = {
  id: string;
  calendar_id: string;
  token_hash: string;
  created_by_user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  used_count: number;
  max_uses: number | null;
};

export async function createCalendarInvite(input: {
  calendarId: string;
  tokenHash: string;
  createdByUserId: string;
  expiresAt: Date;
  maxUses?: number | null;
}) {
  const rows = await sql`
    WITH revoked AS (
      UPDATE calendar_invites
      SET revoked_at = NOW()
      WHERE calendar_id = ${input.calendarId}
        AND revoked_at IS NULL
      RETURNING id
    )
    INSERT INTO calendar_invites (
      calendar_id,
      token_hash,
      created_by_user_id,
      expires_at,
      max_uses
    )
    VALUES (
      ${input.calendarId},
      ${input.tokenHash},
      ${input.createdByUserId},
      ${input.expiresAt.toISOString()},
      ${input.maxUses ?? null}
    )
    RETURNING id, calendar_id, token_hash, created_by_user_id, expires_at, revoked_at, created_at, used_count, max_uses
  ` as CalendarInvite[];

  return rows[0];
}

export async function revokeCalendarInvites(calendarId: string) {
  await sql`
    UPDATE calendar_invites
    SET revoked_at = NOW()
    WHERE calendar_id = ${calendarId}
      AND revoked_at IS NULL
  `;
}

export async function getActiveCalendarInvite(calendarId: string) {
  const rows = await sql`
    SELECT id, calendar_id, token_hash, created_by_user_id, expires_at, revoked_at, created_at, used_count, max_uses
    FROM calendar_invites
    WHERE calendar_id = ${calendarId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
      AND (max_uses IS NULL OR used_count < max_uses)
    ORDER BY created_at DESC
    LIMIT 1
  ` as CalendarInvite[];

  return rows[0] ?? null;
}

export async function findValidInviteByTokenHash(tokenHash: string) {
  const rows = await sql`
    SELECT id, calendar_id, token_hash, created_by_user_id, expires_at, revoked_at, created_at, used_count, max_uses
    FROM calendar_invites
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND expires_at > NOW()
      AND (max_uses IS NULL OR used_count < max_uses)
    LIMIT 1
  ` as CalendarInvite[];

  return rows[0] ?? null;
}

export async function consumeOrRecordInviteUse(inviteId: string) {
  const rows = await sql`
    UPDATE calendar_invites
    SET used_count = used_count + 1
    WHERE id = ${inviteId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
      AND (max_uses IS NULL OR used_count < max_uses)
    RETURNING id, calendar_id, token_hash, created_by_user_id, expires_at, revoked_at, created_at, used_count, max_uses
  ` as CalendarInvite[];

  return rows[0] ?? null;
}
