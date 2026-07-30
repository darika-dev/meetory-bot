import { InlineKeyboard } from "grammy";
import { getAppBaseUrl } from "./config.js";
import { createOAuthState } from "./security/oauthState.js";
import { callbackData, messages, type Language } from "./i18n/index.js";

export type CalendarListItem = {
  id: string;
  summary: string;
};

export type MainMenuMode = "welcome" | "navigation";

export function calendarCallbackData(action: "open" | "activate" | "rename" | "delete", calendarId: string) {
  return `calendar:${action}:${calendarId}`;
}

export function calendarDeleteCallbackData(action: "confirm" | "cancel", calendarId: string) {
  return `calendar:delete:${action}:${calendarId}`;
}

export function calendarMembersCallbackData(calendarId: string) {
  return `calendar:members:${calendarId}`;
}

export function calendarMembersRemoveCallbackData(calendarId: string) {
  return `calendar:members:remove:${calendarId}`;
}

export function calendarMemberRemoveSelectCallbackData(calendarId: string, userId: string) {
  return `calendar:members:remove-select:${calendarId}:${userId}`;
}

export function calendarMemberRemoveConfirmCallbackData(calendarId: string, userId: string) {
  return `calendar:members:remove-confirm:${calendarId}:${userId}`;
}

export function calendarLeaveCallbackData(calendarId: string) {
  return `calendar:leave:${calendarId}`;
}

export function calendarLeaveConfirmCallbackData(calendarId: string) {
  return `calendar:leave-confirm:${calendarId}`;
}

export function calendarInviteCallbackData(calendarId: string) {
  return `calendar:invite:${calendarId}`;
}

export function calendarInviteRegenerateCallbackData(calendarId: string) {
  return `calendar:invite:regenerate:${calendarId}`;
}

export function calendarJoinConfirmCallbackData(rawToken: string) {
  return `calendar:join:${rawToken}`;
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
  return addCalendarsEventsRow(new InlineKeyboard(), language)
    .row()
    .text(messages.newCalendarButton(language), callbackData.createCalendar)
    .row()
    .text(messages.settingsButton(language), callbackData.settingsMenu);
}

function addCalendarsEventsRow(keyboard: InlineKeyboard, language: Language) {
  return keyboard
    .text(messages.calendarsButton(language), callbackData.listCalendars)
    .text(messages.eventsButton(language), callbackData.eventsMenu);
}

export function formatMainMenuMessage(input: {
  language: Language;
  calendarName: string;
  mode: MainMenuMode;
  notices?: string[];
}) {
  const body = input.mode === "welcome"
    ? messages.welcomeBack(input.language, input.calendarName)
    : messages.activeCalendar(input.language, input.calendarName);
  const notices = input.notices ?? [];

  return [
    ...notices,
    notices.length > 0 ? "" : null,
    body,
  ].filter((line): line is string => line !== null).join("\n");
}

export function eventsMenuKeyboard(language: Language) {
  return addEventsMenuRows(new InlineKeyboard(), language);
}

export function settingsTimeCallbackData(kind: "tomorrow" | "weekend", time: string) {
  return `settings:digest:${kind}:time:${time}`;
}

export function settingsWeekendDayCallbackData(weekday: number) {
  return `settings:digest:weekend:day:${weekday}`;
}

export function buildTimeKeyboardRows(input: {
  kind: "tomorrow" | "weekend";
  options: string[];
  selectedTime: string;
}) {
  const buttons = input.options.map((time) => ({
    text: `${input.selectedTime === time ? "✅ " : ""}${time}`,
    callbackData: settingsTimeCallbackData(input.kind, time),
  }));

  const rows: Array<typeof buttons> = [];

  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }

  return rows;
}

function addTimeKeyboardRows(
  keyboard: InlineKeyboard,
  input: {
    kind: "tomorrow" | "weekend";
    options: string[];
    selectedTime: string;
  },
) {
  for (const row of buildTimeKeyboardRows(input)) {
    for (const button of row) {
      keyboard.text(button.text, button.callbackData);
    }

    keyboard.row();
  }

  return keyboard;
}

export function formatSettingsMessage(input: {
  language: Language;
  selectedLanguage: Language;
  tomorrowDigestEnabled: boolean;
  tomorrowDigestTime: string;
  weekendDigestEnabled: boolean;
  weekendDigestWeekday: number;
  weekendDigestTime: string;
  timeZone: string;
}) {
  const tomorrow = input.tomorrowDigestEnabled
    ? messages.settingsDailyAt(input.language, input.tomorrowDigestTime)
    : messages.settingsDisabled(input.language);
  const weekend = input.weekendDigestEnabled
    ? messages.settingsWeekdayAt(input.language, input.weekendDigestWeekday, input.weekendDigestTime)
    : messages.settingsDisabled(input.language);

  return [
    messages.settingsTitle(input.language),
    "",
    messages.settingsLanguageLabel(input.language),
    messages.settingsLanguageName(input.language, input.selectedLanguage),
    "",
    messages.settingsTomorrowDigestLabel(input.language),
    tomorrow,
    "",
    messages.settingsWeekendDigestLabel(input.language),
    weekend,
    "",
    messages.settingsTimeZone(input.language, input.timeZone),
  ].join("\n");
}

export function settingsKeyboard(language: Language) {
  return new InlineKeyboard()
    .text(messages.settingsLanguageLabel(language), callbackData.settingsLanguage)
    .row()
    .text(messages.settingsTomorrowDigestLabel(language), callbackData.settingsTomorrowDigest)
    .row()
    .text(messages.settingsWeekendDigestLabel(language), callbackData.settingsWeekendDigest)
    .row()
    .text(messages.backButton(language), callbackData.mainMenu);
}

export function languageSettingsKeyboard(language: Language, selectedLanguage: Language) {
  const englishPrefix = selectedLanguage === "en" ? "✅ " : "";
  const russianPrefix = selectedLanguage === "ru" ? "✅ " : "";

  return new InlineKeyboard()
    .text(`${englishPrefix}${messages.settingsLanguageName(language, "en")}`, callbackData.settingsLanguageEn)
    .row()
    .text(`${russianPrefix}${messages.settingsLanguageName(language, "ru")}`, callbackData.settingsLanguageRu)
    .row()
    .text(messages.backButton(language), callbackData.settingsMenu);
}

export function formatTomorrowDigestSettings(input: {
  language: Language;
  enabled: boolean;
  time: string;
}) {
  return [
    messages.settingsTomorrowTitle(input.language),
    "",
    input.enabled ? messages.settingsEnabled(input.language) : messages.settingsDisabled(input.language),
    "",
    messages.settingsChooseTime(input.language),
  ].join("\n");
}

export function tomorrowDigestSettingsKeyboard(input: {
  language: Language;
  enabled: boolean;
  time: string;
}) {
  const keyboard = new InlineKeyboard()
    .text(
      input.enabled ? messages.disableButton(input.language) : messages.enableButton(input.language),
      callbackData.settingsTomorrowToggle,
    )
    .row();

  addTimeKeyboardRows(keyboard, {
    kind: "tomorrow",
    options: ["09:00", "12:00", "19:00", "21:00"],
    selectedTime: input.time,
  });

  return keyboard
    .text(messages.backButton(input.language), callbackData.settingsMenu);
}

export function formatWeekendDigestSettings(input: {
  language: Language;
  enabled: boolean;
  weekday: number;
  time: string;
}) {
  return [
    messages.settingsWeekendTitle(input.language),
    "",
    input.enabled
      ? messages.settingsWeekdayAt(input.language, input.weekday, input.time)
      : messages.settingsDisabled(input.language),
    "",
    messages.settingsChooseDay(input.language),
    messages.settingsChooseTime(input.language),
  ].join("\n");
}

export function weekendDigestSettingsKeyboard(input: {
  language: Language;
  enabled: boolean;
  weekday: number;
  time: string;
}) {
  const keyboard = new InlineKeyboard()
    .text(
      input.enabled ? messages.disableButton(input.language) : messages.enableButton(input.language),
      callbackData.settingsWeekendToggle,
    )
    .row();

  for (const weekday of [4, 5]) {
    keyboard.text(
      `${input.weekday === weekday ? "✅ " : ""}${messages.settingsWeekdayName(input.language, weekday)}`,
      settingsWeekendDayCallbackData(weekday),
    );
  }

  keyboard.row();

  addTimeKeyboardRows(keyboard, {
    kind: "weekend",
    options: ["09:00", "12:00", "19:00", "21:00"],
    selectedTime: input.time,
  });

  return keyboard
    .text(messages.backButton(input.language), callbackData.settingsMenu);
}

export function calendarEventsReplyOptions(input: {
  language: Language;
  includeNavigation: boolean;
}) {
  return {
    parse_mode: "HTML" as const,
    link_preview_options: {
      is_disabled: true,
    },
    reply_markup: input.includeNavigation ? eventsMenuKeyboard(input.language) : undefined,
  };
}

function addEventsMenuRows(keyboard: InlineKeyboard, language: Language) {
  return keyboard
    .text(messages.todayButton(language), callbackData.eventsToday)
    .text(messages.tomorrowButton(language), callbackData.eventsTomorrow)
    .row()
    .text(messages.thisWeekendButton(language), callbackData.eventsWeekend)
    .text(messages.nextSevenDaysButton(language), callbackData.eventsNext7Days)
    .row()
    .text(messages.backButton(language), callbackData.mainMenu);
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
  canManage: boolean;
  canLeave: boolean;
}) {
  const keyboard = new InlineKeyboard();

  if (!input.isActive) {
    keyboard.text(messages.makeActiveButton(input.language), calendarCallbackData("activate", input.calendarId)).row();
  }

  keyboard.text(messages.membersButton(input.language), calendarMembersCallbackData(input.calendarId)).row();

  if (input.canManage) {
    keyboard.text(messages.inviteButton(input.language), calendarInviteCallbackData(input.calendarId)).row();
    keyboard
      .text(messages.renameButton(input.language), calendarCallbackData("rename", input.calendarId))
      .row()
      .text(messages.deleteButton(input.language), calendarCallbackData("delete", input.calendarId))
      .row();
  }

  if (input.canLeave) {
    keyboard.text(messages.leaveCalendarButton(input.language), calendarLeaveCallbackData(input.calendarId)).row();
  }

  return keyboard.text(messages.backButton(input.language), callbackData.listCalendars);
}

export type CalendarMemberListItem = {
  userId: string;
  displayName: string;
  role: "owner" | "member";
};

export function formatCalendarMembers(input: {
  language: Language;
  calendarName: string;
  members: CalendarMemberListItem[];
}) {
  const lines = [
    messages.calendarMembersTitle(input.language, input.calendarName),
    "",
  ];

  for (const member of input.members) {
    const role = member.role === "owner"
      ? ` — ${messages.calendarMemberRole(input.language, "owner")}`
      : "";

    lines.push(`• ${member.displayName}${role}`);
  }

  return lines.join("\n");
}

export function calendarMembersKeyboard(input: {
  language: Language;
  calendarId: string;
  canManage: boolean;
  canLeave: boolean;
}) {
  const keyboard = new InlineKeyboard();

  if (input.canManage) {
    keyboard
      .text(messages.inviteButton(input.language), calendarInviteCallbackData(input.calendarId))
      .row()
      .text(messages.removeMemberButton(input.language), calendarMembersRemoveCallbackData(input.calendarId))
      .row();
  }

  if (input.canLeave) {
    keyboard.text(messages.leaveCalendarButton(input.language), calendarLeaveCallbackData(input.calendarId)).row();
  }

  return keyboard.text(messages.backButton(input.language), calendarCallbackData("open", input.calendarId));
}

export function calendarMemberRemoveListKeyboard(input: {
  language: Language;
  calendarId: string;
  members: CalendarMemberListItem[];
}) {
  const keyboard = new InlineKeyboard();

  for (const member of input.members) {
    if (member.role !== "member") {
      continue;
    }

    keyboard.text(member.displayName, calendarMemberRemoveSelectCallbackData(input.calendarId, member.userId)).row();
  }

  return keyboard.text(messages.backButton(input.language), calendarMembersCallbackData(input.calendarId));
}

export function calendarMemberRemoveConfirmKeyboard(input: {
  language: Language;
  calendarId: string;
  userId: string;
}) {
  return new InlineKeyboard()
    .text(messages.confirmRemoveMemberButton(input.language), calendarMemberRemoveConfirmCallbackData(input.calendarId, input.userId))
    .row()
    .text(messages.cancelButton(input.language), calendarMembersCallbackData(input.calendarId));
}

export function calendarLeaveConfirmKeyboard(language: Language, calendarId: string) {
  return new InlineKeyboard()
    .text(messages.confirmLeaveCalendarButton(language), calendarLeaveConfirmCallbackData(calendarId))
    .row()
    .text(messages.cancelButton(language), calendarMembersCallbackData(calendarId));
}

export function formatCalendarInviteMessage(input: {
  language: Language;
  calendarName: string;
  inviteLink: string;
  ttlDays: number;
}) {
  return [
    messages.calendarInviteTitle(input.language, input.calendarName),
    "",
    messages.calendarInviteDescription(input.language),
    input.inviteLink,
    "",
    messages.calendarInviteExpiration(input.language, input.ttlDays),
  ].join("\n");
}

export function calendarInviteKeyboard(input: {
  language: Language;
  calendarId: string;
  inviteLink: string;
}) {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(input.inviteLink)}`;

  return new InlineKeyboard()
    .url(messages.shareInviteButton(input.language), shareUrl)
    .row()
    .text(messages.regenerateInviteButton(input.language), calendarInviteRegenerateCallbackData(input.calendarId))
    .row()
    .text(messages.backButton(input.language), calendarMembersCallbackData(input.calendarId));
}

export function calendarInviteReplyOptions(input: {
  language: Language;
  calendarId: string;
  inviteLink: string;
}) {
  return {
    link_preview_options: {
      is_disabled: true,
    },
    reply_markup: calendarInviteKeyboard(input),
  };
}

export function formatCalendarJoinPreview(input: {
  language: Language;
  calendarName: string;
  ownerName: string;
  memberCount: number;
}) {
  return messages.calendarJoinPreview(input.language, {
    calendarName: input.calendarName,
    ownerName: input.ownerName,
    memberCount: input.memberCount,
  });
}

export function calendarJoinPreviewKeyboard(input: {
  language: Language;
  rawToken: string;
}) {
  return new InlineKeyboard()
    .text(messages.joinCalendarButton(input.language), calendarJoinConfirmCallbackData(input.rawToken))
    .row()
    .text(messages.cancelButton(input.language), callbackData.mainMenu);
}

export function calendarJoinedKeyboard(input: {
  language: Language;
  calendarId: string;
}) {
  return new InlineKeyboard()
    .text(messages.openCalendarButton(input.language), calendarCallbackData("open", input.calendarId))
    .row()
    .text(messages.eventsButton(input.language), callbackData.eventsMenu)
    .row()
    .text(messages.settingsButton(input.language), callbackData.settingsMenu);
}

export function alreadyCalendarMemberKeyboard(input: {
  language: Language;
  calendarId: string;
}) {
  return new InlineKeyboard()
    .text(messages.openCalendarButton(input.language), calendarCallbackData("open", input.calendarId))
    .row()
    .text(messages.backButton(input.language), callbackData.mainMenu);
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

  return addCalendarsEventsRow(keyboard, input.language)
    .row()
    .text(messages.settingsButton(input.language), callbackData.settingsMenu);
}
