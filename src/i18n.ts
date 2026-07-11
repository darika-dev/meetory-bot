export type Language = "ru" | "en";

export const callbackData = {
  createCalendar: "calendar:create",
  cancelCreateCalendar: "calendar:create:cancel",
  listCalendars: "calendar:list",
  inviteUnavailable: "invite:unavailable",
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
  welcomeBack(language: Language, calendarName: string) {
    return language === "ru"
      ? `С возвращением!\n\nАктивный календарь:\n📅 ${calendarName}`
      : `Welcome back!\n\nActive calendar:\n📅 ${calendarName}`;
  },
  createCalendarPrompt(language: Language) {
    return language === "ru"
      ? "Как назвать календарь?\n\nНапример: Meetory Family, Armenian Week или Work Trip."
      : "What should the calendar be called?\n\nFor example: Meetory Family, Armenian Week, or Work Trip.";
  },
  invalidCalendarName(language: Language) {
    return language === "ru"
      ? "Название должно содержать от 1 до 100 символов. Попробуйте ещё раз."
      : "The name must contain between 1 and 100 characters. Try again.";
  },
  creationSuccess(language: Language, calendarName: string) {
    return language === "ru"
      ? `✅ Календарь «${calendarName}» создан.\n\nОн выбран активным.`
      : `✅ Calendar “${calendarName}” created.\n\nIt is now active.`;
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
    return language === "ru" ? "Ваши календари:" : "Your calendars:";
  },
  help(language: Language) {
    return language === "ru"
      ? "Команды:\n/start — открыть главное меню\n/newcalendar — создать календарь\n/calendars — показать календари\n/help — помощь"
      : "Commands:\n/start - open the main menu\n/newcalendar - create a calendar\n/calendars - show calendars\n/help - help";
  },
  connectGoogle(language: Language) {
    return language === "ru" ? "🔗 Подключить Google" : "🔗 Connect Google";
  },
  createCalendarButton(language: Language) {
    return language === "ru" ? "➕ Создать календарь" : "➕ Create calendar";
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
};
