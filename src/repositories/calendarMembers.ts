import { sql } from "../db/client.js";
import type { Calendar } from "./calendars.js";
import type { User } from "./users.js";

export type CalendarRole = "owner" | "member";

export type CalendarMember = {
  calendar_id: string;
  user_id: string;
  role: CalendarRole;
  joined_at: Date;
};

export type CalendarMemberInput = {
  calendarId: string;
  userId: string;
  role?: CalendarRole;
};

export async function addMember(input: CalendarMemberInput) {
  const rows = await sql`
    INSERT INTO calendar_members (
      calendar_id,
      user_id,
      role
    )
    VALUES (
      ${input.calendarId},
      ${input.userId},
      ${input.role ?? "member"}
    )
    ON CONFLICT (calendar_id, user_id)
    DO UPDATE SET role = EXCLUDED.role
    RETURNING calendar_id, user_id, role, joined_at
  ` as CalendarMember[];

  return rows[0];
}

export async function isMember(userId: string, calendarId: string) {
  const rows = await sql`
    SELECT 1
    FROM calendar_members
    WHERE user_id = ${userId}
      AND calendar_id = ${calendarId}
    LIMIT 1
  ` as Array<{ "?column?": number }>;

  return rows.length > 0;
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
      calendars.updated_at,
      calendar_members.role,
      calendar_members.joined_at
    FROM calendar_members
    INNER JOIN calendars ON calendars.id = calendar_members.calendar_id
    WHERE calendar_members.user_id = ${userId}
    ORDER BY calendar_members.joined_at DESC
  ` as Array<Calendar & { role: CalendarRole; joined_at: Date }>;

  return rows;
}

export async function findCalendarsForUser(userId: string) {
  return getCalendarsForUser(userId);
}

export async function deleteByCalendarId(calendarId: string) {
  await sql`
    DELETE FROM calendar_members
    WHERE calendar_id = ${calendarId}
  `;
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
