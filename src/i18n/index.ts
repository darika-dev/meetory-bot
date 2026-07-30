import en from "./en.json" with { type: "json" };
import ru from "./ru.json" with { type: "json" };

export type Language = "ru" | "en";

type TranslationLeaf = string;
type TranslationTree = {
  [key: string]: TranslationLeaf | TranslationTree;
};

type DotPath<T, Prefix extends string = ""> = {
  [Key in keyof T & string]: T[Key] extends string
    ? `${Prefix}${Key}`
    : T[Key] extends Record<string, unknown>
      ? DotPath<T[Key], `${Prefix}${Key}.`>
      : never;
}[keyof T & string];

type TranslationDictionary = typeof en;
type TranslationPath = DotPath<TranslationDictionary>;
type FormatParams = Record<string, string | number | boolean | null | undefined>;

const ruDictionary: TranslationDictionary = ru;

const dictionaries = {
  en,
  ru: ruDictionary,
} satisfies Record<Language, TranslationDictionary>;

export const callbackData = {
  createCalendar: "calendar:create",
  cancelCreateCalendar: "calendar:create:cancel",
  listCalendars: "calendar:list",
  inviteUnavailable: "invite:unavailable",
  confirmGoogleDisconnect: "google:disconnect:confirm",
  cancelGoogleDisconnect: "google:disconnect:cancel",
  cancelRenameCalendar: "calendar:rename:cancel",
  mainMenu: "main:menu",
  eventsMenu: "events:menu",
  eventsToday: "events:today",
  eventsTomorrow: "events:tomorrow",
  eventsWeekend: "events:weekend",
  eventsNext7Days: "events:7d",
  eventCalendar: "event:calendar",
  eventBack: "event:back",
  eventSave: "event:save",
  eventEdit: "event:edit",
  eventEditBack: "event:edit:back",
  eventCancel: "event:cancel",
  eventCancelEdit: "event:edit:cancel",
} as const;

export function getLanguage(language?: string | null): Language {
  return language === "ru" ? "ru" : "en";
}

export function getTelegramLanguage(languageCode?: string): Language {
  return languageCode?.startsWith("ru") ? "ru" : "en";
}

function getByPath(dictionary: TranslationTree, path: string) {
  let current: TranslationLeaf | TranslationTree | undefined = dictionary;

  for (const segment of path.split(".")) {
    current = typeof current === "object" && current !== null
      ? current[segment]
      : undefined;
  }

  if (typeof current !== "string") {
    throw new Error(`Missing i18n key: ${path}`);
  }

  return current;
}

function interpolate(template: string, params: FormatParams = {}) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = params[key];

    return value === null || value === undefined ? match : String(value);
  });
}

export function t(language?: string | null) {
  const dictionary = dictionaries[getLanguage(language)];

  return {
    ...dictionary,
    format(path: TranslationPath, params?: FormatParams) {
      return interpolate(getByPath(dictionary, path), params);
    },
  };
}

export const messages = {
  welcome(language: Language) {
    return t(language).welcome;
  },
  noCalendars(language: Language) {
    return t(language).calendar.none;
  },
  emptyCalendarsList(language: Language) {
    return t(language).calendar.emptyList;
  },
  googleConnected(language: Language) {
    return t(language).calendar.connected;
  },
  oauthAccessDeniedBrowser(language: Language) {
    return t(language).oauth.accessDeniedBrowser;
  },
  oauthAccessDeniedTelegram(language: Language) {
    return t(language).oauth.accessDeniedTelegram;
  },
  oauthCalendarScopeMissingBrowser(language: Language) {
    return t(language).oauth.calendarScopeMissingBrowser;
  },
  oauthCalendarScopeMissingTelegram(language: Language) {
    return t(language).oauth.calendarScopeMissingTelegram;
  },
  oauthGenericErrorBrowser(language: Language) {
    return t(language).oauth.genericErrorBrowser;
  },
  oauthGenericErrorTelegram(language: Language) {
    return t(language).oauth.genericErrorTelegram;
  },
  oauthInvalidStateBrowser(language: Language) {
    return t(language).oauth.invalidStateBrowser;
  },
  oauthIncompleteBrowser(language: Language) {
    return t(language).oauth.incompleteBrowser;
  },
  welcomeBack(language: Language, calendarName: string) {
    return t(language).format("welcomeBack", { calendarName });
  },
  createCalendarPrompt(language: Language) {
    return t(language).calendar.createPrompt;
  },
  invalidCalendarName(language: Language) {
    return t(language).calendar.invalidName;
  },
  creationSuccess(language: Language, calendarName: string) {
    return t(language).format("calendar.created", { calendarName });
  },
  calendarCreatedForwardEventAgain(language: Language) {
    return t(language).calendar.createdForwardEventAgain;
  },
  firstCalendarHint(language: Language) {
    return t(language).calendar.firstCalendarHint;
  },
  creationCancelled(language: Language) {
    return t(language).calendar.creationCancelled;
  },
  createCalendarExpired(language: Language) {
    return t(language).calendar.creationExpired;
  },
  genericCreateError(language: Language) {
    return t(language).calendar.createError;
  },
  inviteUnavailable(language: Language) {
    return t(language).calendar.invitesUnavailable;
  },
  calendarsTitle(language: Language) {
    return t(language).calendar.title;
  },
  calendarDeletedInGoogle(language: Language) {
    return t(language).calendar.deletedInGoogle;
  },
  calendarAccessLost(language: Language) {
    return t(language).calendar.accessLost;
  },
  googleConnectionExpired(language: Language) {
    return t(language).calendar.googleConnectionExpired;
  },
  googleCalendarTemporaryUnavailable(language: Language) {
    return t(language).calendar.temporaryUnavailable;
  },
  inaccessibleCalendarsNotice(language: Language, count: number) {
    return t(language).format("calendar.inaccessibleNotice", { count });
  },
  calendarNotFoundOrAccessDenied(language: Language) {
    return t(language).calendar.notFoundOrAccessDenied;
  },
  calendarCard(language: Language, calendarName: string, isActive: boolean) {
    return t(language).format(isActive ? "calendar.cardActive" : "calendar.cardInactive", { calendarName });
  },
  activeCalendarChanged(language: Language, calendarName: string) {
    return t(language).format("calendar.activeChanged", { calendarName });
  },
  calendarAlreadyActive(language: Language) {
    return t(language).calendar.alreadyActive;
  },
  renameOwnerOnly(language: Language) {
    return t(language).calendar.renameOwnerOnly;
  },
  deleteOwnerOnly(language: Language) {
    return t(language).calendar.deleteOwnerOnly;
  },
  renameCalendarPrompt(language: Language, calendarName: string) {
    return t(language).format("calendar.renamePrompt", { calendarName });
  },
  renameCalendarCancelled(language: Language) {
    return t(language).calendar.renameCancelled;
  },
  renameCalendarSuccess(language: Language, calendarName: string) {
    return t(language).format("calendar.renameSuccess", { calendarName });
  },
  deleteCalendarConfirm(language: Language, calendarName: string) {
    return t(language).format("calendar.deleteConfirm", { calendarName });
  },
  deleteCalendarCancelled(language: Language) {
    return t(language).calendar.deleteCancelled;
  },
  deleteCalendarSuccess(language: Language) {
    return t(language).calendar.deleteSuccess;
  },
  deleteCalendarSuccessWithFallback(language: Language, calendarName: string) {
    return t(language).format("calendar.deleteSuccessWithFallback", { calendarName });
  },
  deleteCalendarSuccessChooseActive(language: Language) {
    return t(language).calendar.deleteSuccessChooseActive;
  },
  deleteCalendarSuccessNoCalendars(language: Language) {
    return t(language).calendar.deleteSuccessNoCalendars;
  },
  primaryCalendarDeleteDenied(language: Language) {
    return t(language).calendar.primaryDeleteDenied;
  },
  textOnlyEventInput(language: Language) {
    return t(language).event.textOnlyInput;
  },
  createCalendarBeforeEvents(language: Language) {
    return t(language).event.createCalendarBeforeEvents;
  },
  eventParseTemporaryError(language: Language) {
    return t(language).event.parseTemporaryError;
  },
  eventParserNotConfigured(language: Language) {
    return t(language).event.parserNotConfigured;
  },
  eventParserBillingUnavailable(language: Language) {
    return t(language).event.parserBillingUnavailable;
  },
  eventParserRateLimited(language: Language) {
    return t(language).event.parserRateLimited;
  },
  eventProcessing(language: Language) {
    return t(language).event.processing;
  },
  eventAnalyseFailed(language: Language) {
    return t(language).event.analyseFailed;
  },
  eventNotFound(language: Language) {
    return t(language).event.notFound;
  },
  eventMissingDate(language: Language) {
    return t(language).event.missingDate;
  },
  eventMissingTitle(language: Language) {
    return t(language).event.missingTitle;
  },
  eventDraftTitle(language: Language) {
    return t(language).event.draftTitle;
  },
  multiDayEventDraftTitle(language: Language) {
    return t(language).event.multiDayDraftTitle;
  },
  eventSaveTo(language: Language) {
    return t(language).event.saveTo;
  },
  eventLocationNotSpecified(language: Language) {
    return t(language).event.locationNotSpecified;
  },
  eventTimeNotSpecified(language: Language) {
    return t(language).event.timeNotSpecified;
  },
  eventAllDay(language: Language) {
    return t(language).event.allDay;
  },
  eventDailyTime(language: Language, timeRange: string) {
    return t(language).format("event.dailyTime", { timeRange });
  },
  dailyRangeEventsWillBeCreated(language: Language, count: number) {
    return t(language).format("event.dailyRangeWillBeCreated", { count });
  },
  eventRangeTooLong(language: Language) {
    return t(language).event.rangeTooLong;
  },
  chooseEventCalendar(language: Language) {
    return t(language).event.chooseCalendar;
  },
  eventEditPrompt(language: Language) {
    return t(language).event.editPrompt;
  },
  eventEditMenu(language: Language) {
    return t(language).event.editMenu;
  },
  eventEditFieldPrompt(language: Language, field: string) {
    const prompts = t(language).event.editFieldPrompts;

    return field in prompts
      ? prompts[field as keyof typeof prompts]
      : prompts.title;
  },
  eventDraftCancelled(language: Language) {
    return t(language).event.draftCancelled;
  },
  eventDraftDiscarded(language: Language) {
    return t(language).event.draftDiscarded;
  },
  eventAlreadySavedOrExpired(language: Language) {
    return t(language).event.alreadySavedOrExpired;
  },
  eventDraftNoLongerAvailable(language: Language) {
    return t(language).event.draftNoLongerAvailable;
  },
  eventSaved(language: Language, title: string, date: string, calendarName: string) {
    return t(language).format("event.saved", { title, date, calendarName });
  },
  dailyRangeEventsSaved(language: Language, count: number, title: string, dateRange: string, timeRange: string, calendarName: string) {
    return t(language).format("event.dailyRangeSaved", {
      calendarName,
      count,
      dateRange,
      timeRange,
      title,
    });
  },
  eventBatchPartialFailure(language: Language) {
    return t(language).event.batchPartialFailure;
  },
  eventsMenuTitle(language: Language) {
    return t(language).eventList.menuTitle;
  },
  eventsPeriodTitle(language: Language, kind: "today" | "tomorrow" | "weekend" | "next7days") {
    return t(language).eventList.periodTitles[kind];
  },
  emptyEventsForAllCalendars(language: Language, kind: "today" | "tomorrow" | "weekend" | "next7days") {
    return t(language).eventList.emptyAllCalendars[kind];
  },
  calendarEventsLoadErrors(language: Language) {
    return t(language).eventList.calendarLoadErrors;
  },
  allCalendarEventsLoadFailed(language: Language) {
    return t(language).eventList.allCalendarsLoadFailed;
  },
  eventListTimezoneMissing(language: Language) {
    return t(language).eventList.timezoneMissing;
  },
  eventListPossiblyStillInProgress(language: Language) {
    return t(language).eventList.possiblyStillInProgress;
  },
  eventListAllDay(language: Language) {
    return t(language).eventList.allDay;
  },
  help(language: Language) {
    return t(language).help;
  },
  disconnectNotConnected(language: Language) {
    return t(language).disconnect.notConnected;
  },
  disconnectConfirm(language: Language, ownsCalendars: boolean) {
    const translator = t(language);

    return ownsCalendars
      ? `${translator.disconnect.confirmBase}\n\n${translator.disconnect.confirmOwnedCalendars}`
      : translator.disconnect.confirmBase;
  },
  disconnectSuccess(language: Language) {
    return t(language).disconnect.success;
  },
  disconnectCancelled(language: Language) {
    return t(language).disconnect.cancelled;
  },
  disconnectError(language: Language) {
    return t(language).disconnect.error;
  },
  connectGoogle(language: Language) {
    return t(language).buttons.connectGoogle;
  },
  connectGoogleCalendar(language: Language) {
    return t(language).buttons.connectGoogleCalendar;
  },
  reconnectGoogleCalendar(language: Language) {
    return t(language).buttons.reconnectGoogleCalendar;
  },
  tryAgainButton(language: Language) {
    return t(language).buttons.tryAgain;
  },
  createCalendarButton(language: Language) {
    return t(language).buttons.createCalendar;
  },
  createFirstCalendarButton(language: Language) {
    return t(language).buttons.createFirstCalendar;
  },
  newCalendarButton(language: Language) {
    return t(language).buttons.newCalendar;
  },
  joinViaInviteButton(language: Language) {
    return t(language).buttons.joinViaInvite;
  },
  calendarsButton(language: Language) {
    return t(language).buttons.calendars;
  },
  eventsButton(language: Language) {
    return t(language).buttons.events;
  },
  todayButton(language: Language) {
    return t(language).buttons.today;
  },
  tomorrowButton(language: Language) {
    return t(language).buttons.tomorrow;
  },
  thisWeekendButton(language: Language) {
    return t(language).buttons.thisWeekend;
  },
  nextSevenDaysButton(language: Language) {
    return t(language).buttons.next7Days;
  },
  cancelButton(language: Language) {
    return t(language).buttons.cancel;
  },
  backButton(language: Language) {
    return t(language).buttons.back;
  },
  makeActiveButton(language: Language) {
    return t(language).buttons.makeActive;
  },
  renameButton(language: Language) {
    return t(language).buttons.rename;
  },
  deleteButton(language: Language) {
    return t(language).buttons.delete;
  },
  deleteForeverButton(language: Language) {
    return t(language).buttons.deleteForever;
  },
  saveEventButton(language: Language) {
    return t(language).buttons.saveEvent;
  },
  editButton(language: Language) {
    return t(language).buttons.edit;
  },
  editTitleButton(language: Language) {
    return t(language).buttons.editTitle;
  },
  editLocationButton(language: Language) {
    return t(language).buttons.editLocation;
  },
  editPriceButton(language: Language) {
    return t(language).buttons.editPrice;
  },
  editDescriptionButton(language: Language) {
    return t(language).buttons.editDescription;
  },
  openGoogleCalendarButton(language: Language) {
    return t(language).buttons.openGoogleCalendar;
  },
  cancelEditingButton(language: Language) {
    return t(language).buttons.cancelEditing;
  },
  disconnectConfirmButton(language: Language) {
    return t(language).buttons.disconnectConfirm;
  },
};
