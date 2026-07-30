import { sql } from "../db/client.js";
import type { Calendar } from "./calendars.js";
import type { User } from "./users.js";

export type CalendarRole = "owner" | "member";

export type CalendarMember = {
  calendar_id: string;
  user_id: string;
  role: CalendarRole;
  joined_at: Date;
  created_at: Date;
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
    RETURNING calendar_id, user_id, role, joined_at, created_at
  ` as CalendarMember[];

  return rows[0];
}

export async function addCalendarMember(calendarId: string, userId: string, role: CalendarRole = "member") {
  return addMember({ calendarId, userId, role });
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

export async function isCalendarMember(calendarId: string, userId: string) {
  return isMember(userId, calendarId);
}

export async function getRole(userId: string, calendarId: string) {
  const rows = await sql`
    SELECT role
    FROM calendar_members
    WHERE user_id = ${userId}
      AND calendar_id = ${calendarId}
    LIMIT 1
  ` as Array<{ role: CalendarRole }>;

  return rows[0]?.role ?? null;
}

export async function getCalendarMembership(calendarId: string, userId: string) {
  const rows = await sql`
    SELECT calendar_id, user_id, role, joined_at, created_at
    FROM calendar_members
    WHERE calendar_id = ${calendarId}
      AND user_id = ${userId}
    LIMIT 1
  ` as CalendarMember[];

  return rows[0] ?? null;
}

export async function isCalendarOwner(calendarId: string, userId: string) {
  return (await getRole(userId, calendarId)) === "owner";
}

export async function removeMember(calendarId: string, userId: string) {
  await sql`
    DELETE FROM calendar_members
    WHERE calendar_id = ${calendarId}
      AND user_id = ${userId}
  `;
}

export async function removeCalendarMember(calendarId: string, userId: string) {
  return removeMember(calendarId, userId);
}

export async function leaveCalendar(calendarId: string, userId: string) {
  return removeMember(calendarId, userId);
}

export async function removeMemberAndChooseFallback(input: {
  calendarId: string;
  userId: string;
}) {
  const rows = await sql`
    WITH removed_member AS (
      DELETE FROM calendar_members
      WHERE calendar_id = ${input.calendarId}
        AND user_id = ${input.userId}
        AND role = 'member'
      RETURNING calendar_id
    ),
    cleared_active AS (
      UPDATE users
      SET active_calendar_id = NULL
      WHERE id = ${input.userId}
        AND active_calendar_id = ${input.calendarId}
        AND EXISTS (SELECT 1 FROM removed_member)
      RETURNING id
    ),
    fallback AS (
      SELECT calendars.id
      FROM calendar_members
      INNER JOIN calendars ON calendars.id = calendar_members.calendar_id
      WHERE calendar_members.user_id = ${input.userId}
      ORDER BY calendar_members.joined_at ASC, calendars.created_at ASC
      LIMIT 1
    ),
    updated_user AS (
      UPDATE users
      SET active_calendar_id = (SELECT id FROM fallback)
      WHERE users.id = ${input.userId}
        AND EXISTS (SELECT 1 FROM cleared_active)
        AND (SELECT id FROM fallback) IS NOT NULL
      RETURNING active_calendar_id
    )
    SELECT
      EXISTS (SELECT 1 FROM removed_member) AS removed,
      (SELECT active_calendar_id FROM updated_user) AS active_calendar_id
  ` as Array<{ removed: boolean; active_calendar_id: string | null }>;

  return rows[0] ?? { removed: false, active_calendar_id: null };
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

export async function findUserCalendars(userId: string) {
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

export async function listCalendarMembers(calendarId: string) {
  return getMembers(calendarId);
}
