import { sql } from "../db/client.ts";
import type { Calendar } from "./calendars.ts";
import type { User } from "./users.ts";

export type CalendarRole = "owner" | "member";

export type CalendarMember = {
  calendar_id: string;
  user_id: string;
  role: CalendarRole;
  joined_at: Date;
};

export async function addMember(calendarId: string, userId: string, role: CalendarRole = "member") {
  const rows = await sql`
    INSERT INTO calendar_members (
      calendar_id,
      user_id,
      role
    )
    VALUES (
      ${calendarId},
      ${userId},
      ${role}
    )
    ON CONFLICT (calendar_id, user_id)
    DO UPDATE SET role = EXCLUDED.role
    RETURNING calendar_id, user_id, role, joined_at
  ` as CalendarMember[];

  return rows[0];
}

export async function removeMember(calendarId: string, userId: string) {
  await sql`
    DELETE FROM calendar_members
    WHERE calendar_id = ${calendarId}
      AND user_id = ${userId}
  `;
}

export async function getCalendarsForUser(userId: string) {
  const rows = await sql`
    SELECT
      calendars.id,
      calendars.name,
      calendars.google_calendar_id,
      calendars.google_connection_id,
      calendars.created_by_user_id,
      calendars.created_at,
      calendar_members.role,
      calendar_members.joined_at
    FROM calendar_members
    INNER JOIN calendars ON calendars.id = calendar_members.calendar_id
    WHERE calendar_members.user_id = ${userId}
    ORDER BY calendar_members.joined_at DESC
  ` as Array<Calendar & { role: CalendarRole; joined_at: Date }>;

  return rows;
}

export async function getMembers(calendarId: string) {
  const rows = await sql`
    SELECT
      users.id,
      users.telegram_id,
      users.telegram_username,
      users.first_name,
      users.last_name,
      users.language,
      users.created_at,
      calendar_members.role,
      calendar_members.joined_at
    FROM calendar_members
    INNER JOIN users ON users.id = calendar_members.user_id
    WHERE calendar_members.calendar_id = ${calendarId}
    ORDER BY calendar_members.joined_at ASC
  ` as Array<User & { role: CalendarRole; joined_at: Date }>;

  return rows;
}
