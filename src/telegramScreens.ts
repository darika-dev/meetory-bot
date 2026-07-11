import { InlineKeyboard } from "grammy";
import { getAppBaseUrl } from "./config.js";
import { createOAuthState } from "./security/oauthState.js";
import { callbackData, messages, type Language } from "./i18n.js";
import type { Calendar } from "./repositories/calendars.js";

export function connectGoogleKeyboard(telegramUserId: string, language: Language) {
  const url = `${getAppBaseUrl()}/google/oauth?state=${encodeURIComponent(createOAuthState(telegramUserId))}`;

  return new InlineKeyboard().url(messages.connectGoogle(language), url);
}

export function noCalendarsKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.createCalendarButton(language), callbackData.createCalendar)
    .row()
    .text(messages.joinViaInviteButton(language), callbackData.inviteUnavailable);
}

export function mainCalendarKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.calendarsButton(language), callbackData.listCalendars)
    .row()
    .text(messages.newCalendarButton(language), callbackData.createCalendar);
}

export function createCalendarCancelKeyboard(language: Language) {
  return new InlineKeyboard().text(messages.cancelButton(language), callbackData.cancelCreateCalendar);
}

export function formatCalendarsList(input: {
  language: Language;
  calendars: Calendar[];
  activeCalendarId: string | null;
}) {
  const lines = [messages.calendarsTitle(input.language), ""];

  for (const calendar of input.calendars) {
    const prefix = calendar.id === input.activeCalendarId ? "✅" : "•";

    lines.push(`${prefix} ${calendar.name}`);
  }

  return lines.join("\n");
}
