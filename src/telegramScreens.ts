import { InlineKeyboard } from "grammy";
import { getAppBaseUrl } from "./config.js";
import { createOAuthState } from "./security/oauthState.js";
import { callbackData, messages, type Language } from "./i18n.js";
import type { Calendar } from "./repositories/calendars.js";

export function connectGoogleKeyboard(telegramUserId: string, language: Language) {
  const url = `${getAppBaseUrl()}/google/oauth?state=${encodeURIComponent(createOAuthState(telegramUserId))}`;

  return new InlineKeyboard().url(messages.connectGoogle(language), url);
}

export function reconnectGoogleKeyboard(telegramUserId: string, language: Language) {
  const url = `${getAppBaseUrl()}/google/oauth?state=${encodeURIComponent(createOAuthState(telegramUserId))}`;

  return new InlineKeyboard().url(messages.connectGoogleCalendar(language), url);
}

export function retryGoogleOAuthKeyboard(telegramUserId: string, language: Language) {
  const url = `${getAppBaseUrl()}/google/oauth?state=${encodeURIComponent(createOAuthState(telegramUserId))}`;

  return new InlineKeyboard().url(messages.tryAgainButton(language), url);
}

export function noCalendarsKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.createFirstCalendarButton(language), callbackData.createCalendar)
    .row()
    .text(messages.joinViaInviteButton(language), callbackData.inviteUnavailable);
}

export function emptyCalendarsKeyboard(language: Language) {
  return new InlineKeyboard().text(messages.createFirstCalendarButton(language), callbackData.createCalendar);
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

export function googleDisconnectConfirmKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.disconnectConfirmButton(language), callbackData.confirmGoogleDisconnect)
    .row()
    .text(messages.cancelButton(language), callbackData.cancelGoogleDisconnect);
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

  lines.push("", "────────────", "", messages.newCalendarButton(input.language));

  return lines.join("\n");
}
