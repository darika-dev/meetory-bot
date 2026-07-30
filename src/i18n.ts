export type Language = "ru" | "en";

export const callbackData = {
  createCalendar: "calendar:create",
  cancelCreateCalendar: "calendar:create:cancel",
  listCalendars: "calendar:list",
  inviteUnavailable: "invite:unavailable",
  confirmGoogleDisconnect: "google:disconnect:confirm",
  cancelGoogleDisconnect: "google:disconnect:cancel",
  cancelRenameCalendar: "calendar:rename:cancel",
  mainMenu: "main:menu",
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
  calendarCreatedForwardEventAgain(language: Language) {
    return language === "ru"
      ? "Календарь создан. Перешлите мероприятие ещё раз."
      : "Calendar created. Please forward the event again.";
  },
  firstCalendarHint(language: Language) {
    return language === "ru"
      ? "🎉 Всё готово! Попробуйте прямо сейчас — перешлите любое сообщение с мероприятием, и Meetory автоматически подготовит событие для вашего календаря."
      : "🎉 You're all set! Try it now — forward any event announcement and Meetory will prepare it for your calendar.";
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
  calendarNotFoundOrAccessDenied(language: Language) {
    return language === "ru"
      ? "Календарь не найден или доступ запрещён."
      : "Calendar not found or access denied.";
  },
  calendarCard(language: Language, calendarName: string, isActive: boolean) {
    if (language === "ru") {
      return isActive
        ? `📅 ${calendarName}\n\nЭто ваш активный календарь.`
        : `📅 ${calendarName}\n\nЧто хотите сделать?`;
    }

    return isActive
      ? `📅 ${calendarName}\n\nThis is your active calendar.`
      : `📅 ${calendarName}\n\nWhat would you like to do?`;
  },
  activeCalendarChanged(language: Language, calendarName: string) {
    return language === "ru"
      ? `✅ Активный календарь изменён.\n\nТекущий календарь:\n📅 ${calendarName}`
      : `✅ Active calendar changed.\n\nCurrent calendar:\n📅 ${calendarName}`;
  },
  calendarAlreadyActive(language: Language) {
    return language === "ru" ? "Этот календарь уже активен." : "This calendar is already active.";
  },
  renameOwnerOnly(language: Language) {
    return language === "ru"
      ? "Переименовать календарь может только владелец."
      : "Only the calendar owner can rename it.";
  },
  deleteOwnerOnly(language: Language) {
    return language === "ru"
      ? "Удалить календарь может только владелец."
      : "Only the calendar owner can delete it.";
  },
  renameCalendarPrompt(language: Language, calendarName: string) {
    return language === "ru"
      ? `Текущее название:\n\n${calendarName}\n\nОтправьте новое название календаря.`
      : `Current name:\n\n${calendarName}\n\nSend a new calendar name.`;
  },
  renameCalendarCancelled(language: Language) {
    return language === "ru" ? "Переименование календаря отменено." : "Calendar rename cancelled.";
  },
  renameCalendarSuccess(language: Language, calendarName: string) {
    return language === "ru"
      ? `✅ Календарь переименован.\n\nНовое название:\n📅 ${calendarName}`
      : `✅ Calendar renamed.\n\nNew name:\n📅 ${calendarName}`;
  },
  deleteCalendarConfirm(language: Language, calendarName: string) {
    return language === "ru"
      ? [
          `⚠️ Удалить календарь «${calendarName}»?`,
          "",
          "Это действие нельзя отменить.",
          "",
          "Календарь и все его события будут навсегда удалены из Google Calendar.",
          "",
          "Участники Meetory потеряют доступ.",
        ].join("\n")
      : [
          `⚠️ Delete calendar “${calendarName}”?`,
          "",
          "This action cannot be undone.",
          "",
          "The calendar and all its events will be permanently deleted from Google Calendar.",
          "",
          "Meetory members will lose access.",
        ].join("\n");
  },
  deleteCalendarCancelled(language: Language) {
    return language === "ru" ? "Удаление календаря отменено." : "Calendar deletion cancelled.";
  },
  deleteCalendarSuccess(language: Language) {
    return language === "ru" ? "✅ Календарь удалён." : "✅ Calendar deleted.";
  },
  deleteCalendarSuccessWithFallback(language: Language, calendarName: string) {
    return language === "ru"
      ? `✅ Календарь удалён.\n\nАктивным выбран календарь:\n📅 ${calendarName}`
      : `✅ Calendar deleted.\n\nActive calendar changed to:\n📅 ${calendarName}`;
  },
  deleteCalendarSuccessChooseActive(language: Language) {
    return language === "ru"
      ? "✅ Календарь удалён.\n\nВыберите другой активный календарь."
      : "✅ Calendar deleted.\n\nChoose another active calendar.";
  },
  deleteCalendarSuccessNoCalendars(language: Language) {
    return language === "ru"
      ? "✅ Календарь удалён.\n\nУ вас пока нет календарей."
      : "✅ Calendar deleted.\n\nYou don't have any calendars yet.";
  },
  primaryCalendarDeleteDenied(language: Language) {
    return language === "ru"
      ? "Meetory не может удалить основной Google Календарь."
      : "The primary Google Calendar cannot be deleted by Meetory.";
  },
  textOnlyEventInput(language: Language) {
    return language === "ru"
      ? "Сейчас я умею распознавать только текст мероприятия или подпись к изображению."
      : "I can currently read only event details sent as text or as a media caption.";
  },
  createCalendarBeforeEvents(language: Language) {
    return language === "ru"
      ? "Создайте календарь или присоединитесь к нему, прежде чем сохранять мероприятия."
      : "Create or join a calendar before saving events.";
  },
  eventParseTemporaryError(language: Language) {
    return language === "ru"
      ? "Сейчас не удалось обработать мероприятие. Попробуйте ещё раз позже."
      : "I couldn't process this event right now. Please try again later.";
  },
  eventParserNotConfigured(language: Language) {
    return language === "ru"
      ? "Распознавание мероприятий пока не настроено. Администратору нужно добавить OpenAI API key."
      : "Event parsing is not configured yet. The administrator needs to add an OpenAI API key.";
  },
  eventParserBillingUnavailable(language: Language) {
    return language === "ru"
      ? "Распознавание мероприятий временно недоступно из-за лимита или биллинга OpenAI."
      : "Event parsing is temporarily unavailable because of OpenAI billing or quota limits.";
  },
  eventParserRateLimited(language: Language) {
    return language === "ru"
      ? "Распознавание мероприятий временно перегружено. Попробуйте ещё раз немного позже."
      : "Event parsing is temporarily rate limited. Please try again in a moment.";
  },
  eventProcessing(language: Language) {
    return language === "ru" ? "⏳ Анализирую мероприятие…" : "⏳ Analysing the event…";
  },
  eventAnalyseFailed(language: Language) {
    return language === "ru"
      ? "Не удалось распознать мероприятие. Попробуйте ещё раз."
      : "I couldn’t analyse this event. Please try again.";
  },
  eventNotFound(language: Language) {
    return language === "ru"
      ? "Я не нашёл мероприятие в этом сообщении.\n\nПерешлите анонс, в котором есть хотя бы название и дата."
      : "I couldn't find an event in this message.\n\nForward an announcement containing at least a title and date.";
  },
  eventMissingDate(language: Language) {
    return language === "ru"
      ? "Я нашёл мероприятие, но не смог определить дату.\n\nОтправьте дату вместе с информацией о мероприятии ещё раз."
      : "I found an event, but couldn't determine its date.\n\nPlease send the date in a new message together with the event details.";
  },
  eventMissingTitle(language: Language) {
    return language === "ru"
      ? "Я не смог определить название мероприятия. Добавьте название и попробуйте ещё раз."
      : "I couldn't determine the event name. Please add a title and try again.";
  },
  eventDraftTitle(language: Language) {
    return language === "ru" ? "Я нашёл мероприятие:" : "I found an event:";
  },
  multiDayEventDraftTitle(language: Language) {
    return language === "ru" ? "Я нашёл многодневное мероприятие:" : "I found a multi-day event:";
  },
  eventSaveTo(language: Language) {
    return language === "ru" ? "Сохранить в:" : "Save to:";
  },
  eventLocationNotSpecified(language: Language) {
    return language === "ru" ? "Не указано" : "Not specified";
  },
  eventTimeNotSpecified(language: Language) {
    return language === "ru" ? "Время не указано" : "Time not specified";
  },
  eventAllDay(language: Language) {
    return language === "ru" ? "Весь день" : "All day";
  },
  eventDailyTime(language: Language, timeRange: string) {
    return language === "ru" ? `Ежедневно, ${timeRange}` : `Daily, ${timeRange}`;
  },
  dailyRangeEventsWillBeCreated(language: Language, count: number) {
    return language === "ru" ? `Будет создано событий: ${count}.` : `${count} events will be created.`;
  },
  eventRangeTooLong(language: Language) {
    return language === "ru"
      ? "Это мероприятие охватывает слишком много дат для автоматического сохранения."
      : "This event spans too many dates to save automatically.";
  },
  chooseEventCalendar(language: Language) {
    return language === "ru" ? "Выберите календарь:" : "Choose a calendar:";
  },
  eventEditPrompt(language: Language) {
    return language === "ru"
      ? "Отправьте исправленную информацию о мероприятии новым сообщением.\n\nТекущий черновик будет заменён."
      : "Send the corrected event details as a new message.\n\nThe current draft will be replaced.";
  },
  eventEditMenu(language: Language) {
    return language === "ru" ? "Что хотите изменить?" : "What would you like to edit?";
  },
  eventEditFieldPrompt(language: Language, field: string) {
    const prompts: Record<string, Record<Language, string>> = {
      title: {
        ru: "Введите новое название.",
        en: "Send a new title.",
      },
      location: {
        ru: "Введите новое место.",
        en: "Send a new location.",
      },
      price: {
        ru: "Отправьте новую цену.",
        en: "Send a new price.",
      },
      description: {
        ru: "Отправьте новое описание.",
        en: "Send a new description.",
      },
    };

    return prompts[field]?.[language] ?? prompts.title[language];
  },
  eventDraftCancelled(language: Language) {
    return language === "ru" ? "Черновик мероприятия удалён." : "Event draft cancelled.";
  },
  eventAlreadySavedOrExpired(language: Language) {
    return language === "ru"
      ? "Это мероприятие уже сохранено или черновик устарел."
      : "This event has already been saved or the draft has expired.";
  },
  eventDraftNoLongerAvailable(language: Language) {
    return language === "ru"
      ? "Этот черновик больше недоступен."
      : "This draft is no longer available.";
  },
  eventSaved(language: Language, title: string, date: string, calendarName: string) {
    return language === "ru"
      ? `✅ Мероприятие сохранено.\n\n🎫 ${title}\n📅 ${date}\n📅 ${calendarName}`
      : `✅ Event saved.\n\n🎫 ${title}\n📅 ${date}\n📅 ${calendarName}`;
  },
  dailyRangeEventsSaved(language: Language, count: number, title: string, dateRange: string, timeRange: string, calendarName: string) {
    return language === "ru"
      ? `✅ Сохранено событий: ${count}.\n\n🎫 ${title}\n📅 ${dateRange}\n🕒 ${timeRange}\n📅 ${calendarName}`
      : `✅ ${count} events saved.\n\n🎫 ${title}\n📅 ${dateRange}\n🕒 ${timeRange}\n📅 ${calendarName}`;
  },
  eventBatchPartialFailure(language: Language) {
    return language === "ru"
      ? "Не удалось сохранить все события. Часть событий могла быть создана в Google Calendar. Проверьте календарь перед повторной попыткой."
      : "Could not save all events. Some events may have been created in Google Calendar. Check the calendar before trying again.";
  },
  help(language: Language) {
    return language === "ru"
      ? [
          "Команды:",
          "/start — открыть главное меню",
          "/newcalendar — создать календарь",
          "/calendars — показать календари",
          "/disconnect — отключить Google Calendar",
          "/help — помощь",
          "",
          "Перешлите анонс мероприятия или отправьте его описание текстом.",
          "Meetory распознает дату, время и место и предложит выбрать календарь.",
        ].join("\n")
      : [
          "Commands:",
          "/start - open the main menu",
          "/newcalendar - create a calendar",
          "/calendars - show calendars",
          "/disconnect - disconnect Google Calendar",
          "/help - help",
          "",
          "Forward an event announcement or send its details as text.",
          "Meetory will extract the date, time and place and ask where to save it.",
        ].join("\n");
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
  backButton(language: Language) {
    return language === "ru" ? "🔙 Назад" : "🔙 Back";
  },
  makeActiveButton(language: Language) {
    return language === "ru" ? "⭐ Сделать активным" : "⭐ Make active";
  },
  renameButton(language: Language) {
    return language === "ru" ? "✏️ Переименовать" : "✏️ Rename";
  },
  deleteButton(language: Language) {
    return language === "ru" ? "🗑 Удалить" : "🗑 Delete";
  },
  deleteForeverButton(language: Language) {
    return language === "ru" ? "🗑 Удалить навсегда" : "🗑 Delete forever";
  },
  saveEventButton(language: Language) {
    return language === "ru" ? "💾 Сохранить" : "💾 Save";
  },
  editButton(language: Language) {
    return language === "ru" ? "✏️ Изменить" : "✏️ Edit";
  },
  editTitleButton(language: Language) {
    return language === "ru" ? "📝 Название" : "📝 Title";
  },
  editLocationButton(language: Language) {
    return language === "ru" ? "📍 Место" : "📍 Location";
  },
  editPriceButton(language: Language) {
    return language === "ru" ? "💰 Цена" : "💰 Price";
  },
  editDescriptionButton(language: Language) {
    return language === "ru" ? "📄 Описание" : "📄 Description";
  },
  openGoogleCalendarButton(language: Language) {
    return language === "ru" ? "Открыть в Google Calendar" : "Open in Google Calendar";
  },
  cancelEditingButton(language: Language) {
    return language === "ru" ? "✖️ Отменить" : "✖️ Cancel editing";
  },
  disconnectConfirmButton(language: Language) {
    return language === "ru" ? "Отключить Google" : "Disconnect Google";
  },
};
