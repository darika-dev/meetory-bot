import * as calendarMembersRepository from "../repositories/calendarMembers.js";
import * as calendarsRepository from "../repositories/calendars.js";

export type CalendarAccess = {
  calendar: calendarsRepository.Calendar;
  role: calendarMembersRepository.CalendarRole;
  isOwner: boolean;
};

export async function getCalendarAccess(calendarId: string, userId: string) {
  const membership = await calendarMembersRepository.getCalendarMembership(calendarId, userId);

  if (!membership) {
    return null;
  }

  const calendar = await calendarsRepository.findById(calendarId);

  if (!calendar) {
    return null;
  }

  return {
    calendar,
    role: membership.role,
    isOwner: membership.role === "owner",
  } satisfies CalendarAccess;
}

export async function assertCalendarMember(calendarId: string, userId: string) {
  const access = await getCalendarAccess(calendarId, userId);

  if (!access) {
    throw new Error("Calendar not found or access denied");
  }

  return access;
}

export async function assertCalendarOwner(calendarId: string, userId: string) {
  const access = await assertCalendarMember(calendarId, userId);

  if (!access.isOwner) {
    throw new Error("Calendar owner permissions required");
  }

  return access;
}
