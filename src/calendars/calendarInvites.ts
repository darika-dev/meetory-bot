import { getCalendarInviteTtlDays } from "../config.js";
import { assertCalendarOwner } from "./calendarAccess.js";
import {
  generateCalendarInviteToken,
  hashCalendarInviteToken,
  isValidCalendarInviteTokenShape,
} from "./calendarInviteTokens.js";
import * as calendarInvitesRepository from "../repositories/calendarInvites.js";
import * as calendarMembersRepository from "../repositories/calendarMembers.js";
import * as calendarsRepository from "../repositories/calendars.js";
import type { User } from "../repositories/users.js";

export type CalendarInvitePreview = {
  inviteId: string;
  calendar: calendarsRepository.Calendar;
  owner: User | null;
  memberCount: number;
  alreadyMember: boolean;
  isOwner: boolean;
};

export function buildCalendarInviteLink(input: {
  botUsername: string;
  rawToken: string;
}) {
  return `https://t.me/${input.botUsername}?start=join_${input.rawToken}`;
}

export function parseCalendarJoinStartPayload(text: string | undefined) {
  const [, payload] = text?.trim().split(/\s+/, 2) ?? [];

  if (!payload?.startsWith("join_")) {
    return null;
  }

  const rawToken = payload.slice("join_".length);

  return isValidCalendarInviteTokenShape(rawToken) ? rawToken : null;
}

export async function createCalendarInviteLink(input: {
  calendarId: string;
  ownerUserId: string;
  botUsername: string;
}) {
  await assertCalendarOwner(input.calendarId, input.ownerUserId);

  const rawToken = generateCalendarInviteToken();
  const tokenHash = hashCalendarInviteToken(rawToken);
  const ttlDays = getCalendarInviteTtlDays();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const invite = await calendarInvitesRepository.createCalendarInvite({
    calendarId: input.calendarId,
    createdByUserId: input.ownerUserId,
    expiresAt,
    tokenHash,
  });

  return {
    invite,
    rawToken,
    inviteLink: buildCalendarInviteLink({
      botUsername: input.botUsername,
      rawToken,
    }),
    ttlDays,
  };
}

export async function getInvitePreviewByRawToken(rawToken: string, userId: string): Promise<CalendarInvitePreview | null> {
  if (!isValidCalendarInviteTokenShape(rawToken)) {
    return null;
  }

  const invite = await calendarInvitesRepository.findValidInviteByTokenHash(hashCalendarInviteToken(rawToken));

  if (!invite) {
    return null;
  }

  const calendar = await calendarsRepository.findById(invite.calendar_id);

  if (!calendar) {
    return null;
  }

  const members = await calendarMembersRepository.listCalendarMembers(calendar.id);
  const membership = members.find((member) => member.id === userId) ?? null;
  const owner = members.find((member) => member.role === "owner") ?? null;

  return {
    inviteId: invite.id,
    calendar,
    owner,
    memberCount: members.length,
    alreadyMember: Boolean(membership),
    isOwner: membership?.role === "owner",
  };
}

export async function joinCalendarByRawToken(input: {
  rawToken: string;
  userId: string;
}) {
  const preview = await getInvitePreviewByRawToken(input.rawToken, input.userId);

  if (!preview) {
    return null;
  }

  const alreadyMember = preview.alreadyMember;

  if (!alreadyMember) {
    await calendarMembersRepository.addCalendarMember(preview.calendar.id, input.userId, "member");
    await calendarInvitesRepository.consumeOrRecordInviteUse(preview.inviteId);
  }

  const nextPreview = await getInvitePreviewByRawToken(input.rawToken, input.userId);

  return nextPreview
    ? {
      ...nextPreview,
      wasAlreadyMember: alreadyMember,
    }
    : null;
}
