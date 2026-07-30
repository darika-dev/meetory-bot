import { InlineKeyboard } from "grammy";
import { getAppBaseUrl } from "./config.js";
import { createOAuthState } from "./security/oauthState.js";
import { callbackData, messages, type Language } from "./i18n.js";

export type CalendarListItem = {
  id: string;
  summary: string;
};

export function calendarCallbackData(action: "open" | "activate" | "rename" | "delete", calendarId: string) {
  return `calendar:${action}:${calendarId}`;
}

export function calendarDeleteCallbackData(action: "confirm" | "cancel", calendarId: string) {
  return `calendar:delete:${action}:${calendarId}`;
}

export function eventCalendarCallbackData(calendarId: string) {
  return `event:calendar:${calendarId}`;
}

export function connectGoogleKeyboard(telegramUserId: string, language: Language) {
  const url = `${getAppBaseUrl()}/google/oauth?state=${encodeURIComponent(createOAuthState(telegramUserId))}`;

  return new InlineKeyboard().url(messages.connectGoogle(language), url);
}

export function reconnectGoogleKeyboard(telegramUserId: string, language: Language) {
  const url = `${getAppBaseUrl()}/google/oauth?state=${encodeURIComponent(createOAuthState(telegramUserId))}`;

  return new InlineKeyboard().url(messages.reconnectGoogleCalendar(language), url);
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

export function renameCalendarCancelKeyboard(language: Language) {
  return new InlineKeyboard().text(messages.cancelButton(language), callbackData.cancelRenameCalendar);
}

export function googleDisconnectConfirmKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.disconnectConfirmButton(language), callbackData.confirmGoogleDisconnect)
    .row()
    .text(messages.cancelButton(language), callbackData.cancelGoogleDisconnect);
}

export function formatCalendarsList(input: {
  language: Language;
  calendars: CalendarListItem[];
  activeCalendarId: string | null;
  inaccessibleCount?: number;
}) {
  const lines = [messages.calendarsTitle(input.language), ""];

  for (const calendar of input.calendars) {
    const prefix = calendar.id === input.activeCalendarId ? "✅" : "•";

    lines.push(`${prefix} ${calendar.summary}`);
  }

  if (input.inaccessibleCount && input.inaccessibleCount > 0) {
    lines.push("", messages.inaccessibleCalendarsNotice(input.language, input.inaccessibleCount));
  }

  lines.push("", "────────────", "", messages.newCalendarButton(input.language));

  return lines.join("\n");
}

export function calendarsListKeyboard(input: {
  language: Language;
  calendars: CalendarListItem[];
  activeCalendarId: string | null;
}) {
  const keyboard = new InlineKeyboard();

  for (const calendar of input.calendars) {
    const prefix = calendar.id === input.activeCalendarId ? "✅" : "📅";

    keyboard.text(`${prefix} ${calendar.summary}`, calendarCallbackData("open", calendar.id)).row();
  }

  keyboard
    .text(messages.newCalendarButton(input.language), callbackData.createCalendar)
    .row()
    .text(messages.backButton(input.language), callbackData.mainMenu);

  return keyboard;
}

export function calendarCardKeyboard(input: {
  language: Language;
  calendarId: string;
  isActive: boolean;
}) {
  const keyboard = new InlineKeyboard();

  if (!input.isActive) {
    keyboard.text(messages.makeActiveButton(input.language), calendarCallbackData("activate", input.calendarId)).row();
  }

  return keyboard
    .text(messages.renameButton(input.language), calendarCallbackData("rename", input.calendarId))
    .row()
    .text(messages.deleteButton(input.language), calendarCallbackData("delete", input.calendarId))
    .row()
    .text(messages.backButton(input.language), callbackData.listCalendars);
}

export function calendarDeleteConfirmKeyboard(language: Language, calendarId: string) {
  return new InlineKeyboard()
    .text(messages.deleteForeverButton(language), calendarDeleteCallbackData("confirm", calendarId))
    .row()
    .text(messages.cancelButton(language), calendarDeleteCallbackData("cancel", calendarId));
}

export function calendarBackKeyboard(language: Language, calendarId: string) {
  return new InlineKeyboard()
    .text(messages.calendarsButton(language), callbackData.listCalendars)
    .row()
    .text(messages.backButton(language), calendarCallbackData("open", calendarId));
}

export function eventDraftKeyboard(language: Language, calendarName: string, draftId: string) {
  return new InlineKeyboard()
    .text(`📅 ${calendarName} ▾`, callbackData.eventCalendar)
    .row()
    .text(messages.saveEventButton(language), `${callbackData.eventSave}:${draftId}`)
    .row()
    .text(messages.editButton(language), callbackData.eventEdit)
    .row()
    .text(messages.cancelButton(language), callbackData.eventCancel);
}

export function eventEditMenuKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.editTitleButton(language), "event:edit:title")
    .row()
    .text(messages.editLocationButton(language), "event:edit:location")
    .row()
    .text(messages.editPriceButton(language), "event:edit:price")
    .row()
    .text(messages.editDescriptionButton(language), "event:edit:description")
    .row()
    .text(messages.backButton(language), callbackData.eventBack);
}

export function eventCalendarSelectionKeyboard(input: {
  language: Language;
  calendars: CalendarListItem[];
  selectedCalendarId: string;
}) {
  const keyboard = new InlineKeyboard();

  for (const calendar of input.calendars) {
    const prefix = calendar.id === input.selectedCalendarId ? "✅" : "📅";

    keyboard.text(`${prefix} ${calendar.summary}`, eventCalendarCallbackData(calendar.id)).row();
  }

  return keyboard.text(messages.backButton(input.language), callbackData.eventBack);
}

export function eventEditCancelKeyboard(language: Language) {
  return new InlineKeyboard().text(messages.cancelEditingButton(language), callbackData.eventCancelEdit);
}

export function eventEditFieldKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.backButton(language), callbackData.eventEditBack)
    .row()
    .text(messages.cancelButton(language), callbackData.eventCancel);
}

export function eventSavedKeyboard(input: {
  language: Language;
  htmlLink?: string | null;
}) {
  const keyboard = new InlineKeyboard();

  if (input.htmlLink) {
    keyboard.url(messages.openGoogleCalendarButton(input.language), input.htmlLink).row();
  }

  return keyboard.text(messages.calendarsButton(input.language), callbackData.listCalendars);
}
