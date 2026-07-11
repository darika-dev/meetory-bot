import { Bot, type Context } from "grammy";
import * as calendarsRepository from "./repositories/calendars.js";
import * as googleConnectionsRepository from "./repositories/googleConnections.js";
import * as pendingActionsRepository from "./repositories/pendingActions.js";
import * as usersRepository from "./repositories/users.js";
import { createCalendarForUser, deleteCalendarForUser } from "./google/calendarService.js";
import { getLanguage, getTelegramLanguage, messages } from "./i18n.js";
import {
  connectGoogleKeyboard,
  createCalendarCancelKeyboard,
  emptyCalendarsKeyboard,
  formatCalendarsList,
  mainCalendarKeyboard,
  noCalendarsKeyboard,
} from "./telegramScreens.js";

const CREATE_CALENDAR_TTL_MS = 15 * 60 * 1000;
const token = process.env.TELEGRAM_API_TOKEN?.trim();

function createBot() {
  if (!token) {
    return null;
  }

  try {
    return new Bot(token);
  } catch {
    return null;
  }
}

type ReplyTarget = {
  reply: Context["reply"];
};

export const bot = createBot();

bot?.catch((error) => {
  console.error("Telegram bot error:", {
    operation: "telegram_update",
    errorName: error.error instanceof Error ? error.error.name : typeof error.error,
    errorMessage: error.error instanceof Error ? error.error.message : String(error.error),
  });
});

async function upsertTelegramUser(ctx: Context) {
  const from = ctx.from;

  if (!from) {
    return null;
  }

  return usersRepository.upsertTelegramUser({
    telegramId: String(from.id),
    telegramUsername: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    language: getTelegramLanguage(from.language_code),
  });
}

async function getActiveOrFirstCalendar(userId: string) {
  const activeCalendar = await calendarsRepository.findActiveForUser(userId);

  if (activeCalendar) {
    return activeCalendar;
  }

  const firstCalendar = await calendarsRepository.findFirstForUser(userId);

  if (firstCalendar) {
    await usersRepository.setActiveCalendar(userId, firstCalendar.id);
  }

  return firstCalendar;
}

async function showHome(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    return target.reply(messages.welcome(language), {
      reply_markup: connectGoogleKeyboard(user.telegram_id, language),
    });
  }

  const calendars = await calendarsRepository.findForUser(user.id);

  if (calendars.length === 0) {
    return target.reply(messages.noCalendars(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  const activeCalendar = await getActiveOrFirstCalendar(user.id);

  if (!activeCalendar) {
    return target.reply(messages.noCalendars(language), {
      reply_markup: noCalendarsKeyboard(language),
    });
  }

  return target.reply(messages.welcomeBack(language, activeCalendar.name), {
    reply_markup: mainCalendarKeyboard(language),
  });
}

async function startCreateCalendarFlow(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    return target.reply(messages.welcome(language), {
      reply_markup: connectGoogleKeyboard(user.telegram_id, language),
    });
  }

  await pendingActionsRepository.upsertCreateCalendarAction(
    user.id,
    new Date(Date.now() + CREATE_CALENDAR_TTL_MS),
  );

  return target.reply(messages.createCalendarPrompt(language), {
    reply_markup: createCalendarCancelKeyboard(language),
  });
}

async function showCalendars(target: ReplyTarget, user: usersRepository.User) {
  const language = getLanguage(user.language);
  const calendars = await calendarsRepository.findForUser(user.id);

  if (calendars.length === 0) {
    return target.reply(messages.emptyCalendarsList(language), {
      reply_markup: emptyCalendarsKeyboard(language),
    });
  }

  const activeCalendar = await getActiveOrFirstCalendar(user.id);

  return target.reply(formatCalendarsList({
    language,
    calendars,
    activeCalendarId: activeCalendar?.id ?? null,
  }), {
    reply_markup: mainCalendarKeyboard(language),
  });
}

function validateCalendarName(text: string) {
  const name = text.trim();

  if (name.length < 1 || name.length > 100) {
    return null;
  }

  return name;
}

bot?.command("start", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  return showHome(ctx, user);
});

bot?.command("newcalendar", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  return startCreateCalendarFlow(ctx, user);
});

bot?.command("calendars", async (ctx) => {
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return ctx.reply("Meetory is running.");
  }

  return showCalendars(ctx, user);
});

bot?.command("help", async (ctx) => {
  const user = await upsertTelegramUser(ctx);
  const language = getLanguage(user?.language);

  return ctx.reply(messages.help(language));
});

bot?.callbackQuery("calendar:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await upsertTelegramUser(ctx);

  if (!user) {
    return;
  }

  return startCreateCalendarFlow(ctx, user);
});

bot?.callbackQuery("calendar:create:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;

  if (!user) {
    return;
  }

  await pendingActionsRepository.deleteByUserId(user.id);

  return ctx.reply(messages.creationCancelled(getLanguage(user.language)));
});

bot?.callbackQuery("calendar:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;

  if (!user) {
    return;
  }

  return showCalendars(ctx, user);
});

bot?.callbackQuery("invite:unavailable", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from
    ? await usersRepository.findByTelegramId(String(ctx.from.id))
    : null;
  const language = getLanguage(user?.language);

  return ctx.reply(messages.inviteUnavailable(language));
});

bot?.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith("/")) {
    return;
  }

  const from = ctx.from;

  if (!from) {
    return;
  }

  const user = await usersRepository.findByTelegramId(String(from.id));

  if (!user) {
    return;
  }

  const language = getLanguage(user.language);
  const pendingAction = await pendingActionsRepository.findByUserId(user.id);

  if (!pendingAction) {
    return;
  }

  if (new Date(pendingAction.expires_at).getTime() <= Date.now()) {
    await pendingActionsRepository.deleteByUserId(user.id);

    return ctx.reply(messages.createCalendarExpired(language));
  }

  if (pendingAction.type !== "create_calendar") {
    return;
  }

  const name = validateCalendarName(text);

  if (!name) {
    return ctx.reply(messages.invalidCalendarName(language));
  }

  let created: Awaited<ReturnType<typeof createCalendarForUser>>;

  try {
    created = await createCalendarForUser({
      userId: user.id,
      name,
    });
  } catch (error) {
    console.error("Calendar creation failed:", {
      operation: "create_google_calendar",
      userId: user.id,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return ctx.reply(messages.genericCreateError(language));
  }

  let calendar: calendarsRepository.Calendar;
  const hadCalendarsBeforeCreate = (await calendarsRepository.findForUser(user.id)).length > 0;

  try {
    calendar = await calendarsRepository.createOwnedCalendarAndActivate({
      name: created.calendar.name,
      googleCalendarId: created.calendar.googleCalendarId,
      googleConnectionId: created.connection.id,
      createdByUserId: user.id,
      ownerUserId: user.id,
    });
  } catch (error) {
    try {
      await deleteCalendarForUser({
        connection: created.connection,
        googleCalendarId: created.calendar.googleCalendarId,
      });
    } catch (compensationError) {
      console.error("Calendar creation compensation failed:", {
        operation: "delete_google_calendar_after_db_error",
        userId: user.id,
        errorName: compensationError instanceof Error ? compensationError.name : typeof compensationError,
        errorMessage: compensationError instanceof Error ? compensationError.message : String(compensationError),
      });
    }

    console.error("Calendar creation failed:", {
      operation: "save_created_calendar",
      userId: user.id,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return ctx.reply(messages.genericCreateError(language));
  }

  await ctx.reply(messages.creationSuccess(language, calendar.name), {
    reply_markup: mainCalendarKeyboard(language),
  });

  if (!hadCalendarsBeforeCreate) {
    return ctx.reply(messages.firstCalendarHint(language));
  }
});
