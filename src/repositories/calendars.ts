import { sql } from "../db/client.ts";

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
