export type Language = "ru" | "en";

export const callbackData = {
  createCalendar: "calendar:create",
  cancelCreateCalendar: "calendar:create:cancel",
  listCalendars: "calendar:list",
  inviteUnavailable: "invite:unavailable",
  confirmGoogleDisconnect: "google:disconnect:confirm",
  cancelGoogleDisconnect: "google:disconnect:cancel",
} as const;

export function getLanguage(language?: string | null): Language {
  return language === "ru" ? "ru" : "en";
}

export function getTelegramLanguage(languageCode?: string): Language {
  return languageCode?.startsWith("ru") ? "ru" : "en";
}

export const messages = {
  welcome(language: Language) {
    return language === "ru"
      ? [
          "👋 Добро пожаловать в Meetory!",
          "",
          "Meetory помогает сохранять интересные мероприятия в общие календари.",
          "",
          "Для начала подключите Google Calendar.",
        ].join("\n")
      : [
          "👋 Welcome to Meetory!",
          "",
          "Meetory helps you save interesting events to shared calendars.",
          "",
          "Connect Google Calendar to get started.",
        ].join("\n");
  },
  noCalendars(language: Language) {
    return language === "ru"
      ? "У вас пока нет календарей.\n\nЧто хотите сделать?"
      : "You don't have any calendars yet.\n\nWhat would you like to do?";
  },
  emptyCalendarsList(language: Language) {
    return language === "ru" ? "У вас пока нет календарей." : "You don't have any calendars yet.";
  },
  googleConnected(language: Language) {
    return language === "ru" ? "🎉 Google Календарь подключён!" : "🎉 Google Calendar connected!";
  },
  oauthAccessDeniedBrowser(language: Language) {
    return language === "ru"
      ? "Подключение Google Календаря отменено.\n\nВы можете закрыть эту страницу и вернуться в Telegram."
      : "Google Calendar connection was cancelled.\n\nYou can close this page and return to Telegram.";
  },
  oauthAccessDeniedTelegram(language: Language) {
    return language === "ru"
      ? "Google Календарь не был подключён.\n\nВы можете попробовать снова, когда будете готовы."
      : "Google Calendar wasn't connected.\n\nYou can try again whenever you're ready.";
  },
  oauthCalendarScopeMissingBrowser(language: Language) {
    return language === "ru"
      ? "Доступ к Google Календарю не был предоставлен.\n\nВы можете закрыть эту страницу и попробовать подключение снова в Telegram."
      : "Google Calendar access wasn't granted.\n\nYou can close this page and try connecting again in Telegram.";
  },
  oauthCalendarScopeMissingTelegram(language: Language) {
    return language === "ru"
      ? "Google Календарь не был подключён, потому что доступ к календарю не был предоставлен.\n\nВы можете попробовать снова, когда будете готовы."
      : "Google Calendar wasn't connected because calendar access wasn't granted.\n\nYou can try again whenever you're ready.";
  },
  oauthGenericErrorBrowser(language: Language) {
    return language === "ru"
      ? "Не удалось подключить Google Календарь.\n\nВернитесь в Telegram и попробуйте ещё раз."
      : "Google Calendar couldn't be connected.\n\nReturn to Telegram and try again.";
  },
  oauthGenericErrorTelegram(language: Language) {
    return language === "ru"
      ? "Не удалось подключить Google Календарь.\n\nПопробуйте ещё раз."
      : "Google Calendar couldn't be connected.\n\nPlease try again.";
  },
  oauthInvalidStateBrowser(language: Language) {
    return language === "ru"
      ? "Ссылка авторизации недействительна или устарела.\n\nВернитесь в Telegram и начните подключение заново."
      : "This authorization link is invalid or has expired.\n\nReturn to Telegram and start again.";
  },
  oauthIncompleteBrowser(language: Language) {
    return language === "ru"
      ? "Ответ Google об авторизации неполный.\n\nВернитесь в Telegram и попробуйте ещё раз."
      : "The Google authorization response is incomplete.\n\nReturn to Telegram and try again.";
  },
  welcomeBack(language: Language, calendarName: string) {
    return language === "ru"
      ? `С возвращением!\n\nАктивный календарь:\n📅 ${calendarName}`
      : `Welcome back!\n\nActive calendar:\n📅 ${calendarName}`;
  },
  createCalendarPrompt(language: Language) {
    return language === "ru"
      ? "Как назвать календарь?\n\nНапример:\n\n• Meetory Family\n• Armenian Week\n• Work Trip"
      : "What should your calendar be called?\n\nExamples:\n\n• Meetory Family\n• Armenian Week\n• Work Trip";
  },
  invalidCalendarName(language: Language) {
    return language === "ru"
      ? "Название должно содержать от 1 до 100 символов. Попробуйте ещё раз."
      : "The name must contain between 1 and 100 characters. Try again.";
  },
  creationSuccess(language: Language, calendarName: string) {
    return language === "ru"
      ? `✅ Календарь "${calendarName}" создан.\n\nТеперь это ваш активный календарь.`
      : `✅ Calendar "${calendarName}" created.\n\nIt is now your active calendar.`;
  },
  firstCalendarHint(language: Language) {
    return language === "ru"
      ? "💡 Совсем скоро вы сможете просто переслать любое мероприятие в Meetory, а бот сам предложит сохранить его в календарь."
      : "💡 Soon you'll be able to forward any event to Meetory and save it directly to your calendar.";
  },
  creationCancelled(language: Language) {
    return language === "ru" ? "Создание календаря отменено." : "Calendar creation cancelled.";
  },
  createCalendarExpired(language: Language) {
    return language === "ru"
      ? "Время ожидания истекло. Начните создание календаря заново."
      : "This request expired. Start calendar creation again.";
  },
  genericCreateError(language: Language) {
    return language === "ru"
      ? "Не удалось создать календарь. Попробуйте ещё раз позже."
      : "Could not create the calendar. Please try again later.";
  },
  inviteUnavailable(language: Language) {
    return language === "ru" ? "Функция приглашений появится позже." : "Invites will be available later.";
  },
  calendarsTitle(language: Language) {
    return language === "ru" ? "Ваши календари" : "Your calendars";
  },
  calendarDeletedInGoogle(language: Language) {
    return language === "ru"
      ? "Этот календарь был удалён в Google Calendar, поэтому он удалён из Meetory."
      : "The calendar was deleted in Google Calendar, so it has been removed from Meetory.";
  },
  calendarAccessLost(language: Language) {
    return language === "ru"
      ? [
          "У Meetory больше нет доступа к этому Google Календарю.",
          "",
          "Переподключите Google Calendar или восстановите доступ в настройках Google Calendar.",
        ].join("\n")
      : [
          "Meetory no longer has access to this Google Calendar.",
          "",
          "Reconnect Google Calendar or restore access in Google Calendar settings.",
        ].join("\n");
  },
  googleConnectionExpired(language: Language) {
    return language === "ru"
      ? [
          "Подключение к Google Calendar истекло или было отозвано.",
          "",
          "Подключите Google Calendar снова, чтобы продолжить.",
        ].join("\n")
      : [
          "Your Google Calendar connection has expired or was revoked.",
          "",
          "Connect Google Calendar again to continue.",
        ].join("\n");
  },
  googleCalendarTemporaryUnavailable(language: Language) {
    return language === "ru"
      ? "Google Calendar временно недоступен. Попробуйте ещё раз позже."
      : "Google Calendar is temporarily unavailable. Please try again later.";
  },
  inaccessibleCalendarsNotice(language: Language, count: number) {
    return language === "ru"
      ? `Недоступные календари: ${count}.`
      : `Unavailable calendars: ${count}.`;
  },
  help(language: Language) {
    return language === "ru"
      ? "Команды:\n/start — открыть главное меню\n/newcalendar — создать календарь\n/calendars — показать календари\n/disconnect — отключить Google Calendar\n/help — помощь"
      : "Commands:\n/start - open the main menu\n/newcalendar - create a calendar\n/calendars - show calendars\n/disconnect - disconnect Google Calendar\n/help - help";
  },
  disconnectNotConnected(language: Language) {
    return language === "ru"
      ? "Google Calendar сейчас не подключён."
      : "Google Calendar is not connected.";
  },
  disconnectConfirm(language: Language, ownsCalendars: boolean) {
    const base = language === "ru"
      ? [
          "Отключить Google Calendar?",
          "",
          "Meetory отзовёт доступ к вашему Google Calendar и удалит сохранённую авторизацию.",
        ]
      : [
          "Disconnect Google Calendar?",
          "",
          "Meetory will revoke access to your Google Calendar and remove the saved authorization.",
        ];

    if (ownsCalendars) {
      base.push(
        "",
        language === "ru"
          ? "Вы владеете календарями. Meetory временно не сможет ими управлять до повторной авторизации."
          : "You own calendars. Meetory will temporarily be unable to manage them until you authorize Google again.",
      );
    }

    return base.join("\n");
  },
  disconnectSuccess(language: Language) {
    return language === "ru"
      ? [
          "Google Календарь отключён.",
          "",
          "Ваши календари Meetory и участники сохранены.",
          "",
          "Подключите Google Календарь снова, когда будете готовы.",
        ].join("\n")
      : [
          "Google Calendar disconnected.",
          "",
          "Your Meetory calendars and members were kept.",
          "",
          "Connect Google Calendar again whenever you're ready.",
        ].join("\n");
  },
  disconnectCancelled(language: Language) {
    return language === "ru" ? "Отключение Google Calendar отменено." : "Google Calendar disconnect cancelled.";
  },
  disconnectError(language: Language) {
    return language === "ru"
      ? "Не удалось отключить Google Calendar. Попробуйте ещё раз позже."
      : "Could not disconnect Google Calendar. Please try again later.";
  },
  connectGoogle(language: Language) {
    return language === "ru" ? "🔗 Подключить Google" : "🔗 Connect Google";
  },
  connectGoogleCalendar(language: Language) {
    return language === "ru" ? "🔗 Подключить Google" : "🔗 Connect Google Calendar";
  },
  reconnectGoogleCalendar(language: Language) {
    return language === "ru" ? "🔗 Переподключить Google" : "🔗 Reconnect Google Calendar";
  },
  tryAgainButton(language: Language) {
    return language === "ru" ? "🔗 Попробовать снова" : "🔗 Try again";
  },
  createCalendarButton(language: Language) {
    return language === "ru" ? "➕ Создать календарь" : "➕ Create calendar";
  },
  createFirstCalendarButton(language: Language) {
    return language === "ru" ? "➕ Создать первый календарь" : "➕ Create your first calendar";
  },
  newCalendarButton(language: Language) {
    return language === "ru" ? "➕ Новый календарь" : "➕ New calendar";
  },
  joinViaInviteButton(language: Language) {
    return language === "ru" ? "🔗 Присоединиться по ссылке" : "🔗 Join via invite link";
  },
  calendarsButton(language: Language) {
    return language === "ru" ? "📅 Календари" : "📅 Calendars";
  },
  cancelButton(language: Language) {
    return language === "ru" ? "✖️ Отмена" : "✖️ Cancel";
  },
  disconnectConfirmButton(language: Language) {
    return language === "ru" ? "Отключить Google" : "Disconnect Google";
  },
};
