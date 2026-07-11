import { sql } from "../db/client.js";

export type Calendar = {
  id: string;
  name: string;
  google_calendar_id: string;
  google_connection_id: string;
  created_by_user_id: string;
  created_at: Date;
};

export type CalendarInput = {
  name: string;
  googleCalendarId: string;
  googleConnectionId: string;
  createdByUserId: string;
};

export type CreateOwnedCalendarInput = CalendarInput & {
  ownerUserId: string;
};

export async function create(input: CalendarInput) {
  const rows = await sql`
    INSERT INTO calendars (
      name,
      google_calendar_id,
      google_connection_id,
      created_by_user_id
    )
    VALUES (
      ${input.name},
      ${input.googleCalendarId},
      ${input.googleConnectionId},
      ${input.createdByUserId}
    )
    RETURNING id, name, google_calendar_id, google_connection_id, created_by_user_id, created_at
  ` as Calendar[];

  return rows[0];
}

export async function createCalendar(input: CalendarInput) {
  return create(input);
}

export async function createOwnedCalendarAndActivate(input: CreateOwnedCalendarInput) {
  const rows = await sql`
    WITH created_calendar AS (
      INSERT INTO calendars (
        name,
        google_calendar_id,
        google_connection_id,
        created_by_user_id
      )
      VALUES (
        ${input.name},
        ${input.googleCalendarId},
        ${input.googleConnectionId},
        ${input.createdByUserId}
      )
      RETURNING id, name, google_calendar_id, google_connection_id, created_by_user_id, created_at
    ),
    created_member AS (
      INSERT INTO calendar_members (
        calendar_id,
        user_id,
        role
      )
      SELECT id, ${input.ownerUserId}, 'owner'
      FROM created_calendar
      ON CONFLICT (calendar_id, user_id)
      DO UPDATE SET role = EXCLUDED.role
      RETURNING calendar_id
    ),
    updated_user AS (
      UPDATE users
      SET active_calendar_id = (SELECT id FROM created_calendar)
      WHERE id = ${input.ownerUserId}
      RETURNING id
    ),
    deleted_pending_action AS (
      DELETE FROM pending_actions
      WHERE user_id = ${input.ownerUserId}
      RETURNING id
    )
    SELECT id, name, google_calendar_id, google_connection_id, created_by_user_id, created_at
    FROM created_calendar
  ` as Calendar[];

  return rows[0];
}

export async function findById(id: string) {
  const rows = await sql`
    SELECT id, name, google_calendar_id, google_connection_id, created_by_user_id, created_at
    FROM calendars
    WHERE id = ${id}
    LIMIT 1
  ` as Calendar[];

  return rows[0] ?? null;
}

export async function findByGoogleCalendarId(googleCalendarId: string) {
  const rows = await sql`
    SELECT id, name, google_calendar_id, google_connection_id, created_by_user_id, created_at
    FROM calendars
    WHERE google_calendar_id = ${googleCalendarId}
    LIMIT 1
  ` as Calendar[];

  return rows[0] ?? null;
}

export async function findForUser(userId: string) {
  const rows = await sql`
    SELECT
      calendars.id,
      calendars.name,
      calendars.google_calendar_id,
      calendars.google_connection_id,
      calendars.created_by_user_id,
      calendars.created_at
    FROM calendar_members
    INNER JOIN calendars ON calendars.id = calendar_members.calendar_id
    WHERE calendar_members.user_id = ${userId}
    ORDER BY calendar_members.joined_at ASC, calendars.created_at ASC
  ` as Calendar[];

  return rows;
}

export async function findActiveForUser(userId: string) {
  const rows = await sql`
    SELECT
      calendars.id,
      calendars.name,
      calendars.google_calendar_id,
      calendars.google_connection_id,
      calendars.created_by_user_id,
      calendars.created_at
    FROM users
    INNER JOIN calendar_members
      ON calendar_members.user_id = users.id
      AND calendar_members.calendar_id = users.active_calendar_id
    INNER JOIN calendars ON calendars.id = users.active_calendar_id
    WHERE users.id = ${userId}
    LIMIT 1
  ` as Calendar[];

  return rows[0] ?? null;
}

export async function findFirstForUser(userId: string) {
  const rows = await sql`
    SELECT
      calendars.id,
      calendars.name,
      calendars.google_calendar_id,
      calendars.google_connection_id,
      calendars.created_by_user_id,
      calendars.created_at
    FROM calendar_members
    INNER JOIN calendars ON calendars.id = calendar_members.calendar_id
    WHERE calendar_members.user_id = ${userId}
    ORDER BY calendar_members.joined_at ASC, calendars.created_at ASC
    LIMIT 1
  ` as Calendar[];

  return rows[0] ?? null;
}
