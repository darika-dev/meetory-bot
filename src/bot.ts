import { Bot, InlineKeyboard } from "grammy";
import { getAppBaseUrl } from "./config.js";
import * as googleConnectionsRepository from "./repositories/googleConnections.js";
import * as usersRepository from "./repositories/users.js";
import { createOAuthState } from "./security/oauthState.js";

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

export const bot = createBot();

bot?.command("start", async (ctx) => {
  const from = ctx.from;

  if (!from) {
    return ctx.reply("Meetory is running.");
  }

  const language = from.language_code?.startsWith("ru") ? "ru" : "en";
  const user = await usersRepository.upsertTelegramUser({
    telegramId: String(from.id),
    telegramUsername: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
    language,
  });
  const googleConnection = await googleConnectionsRepository.findByUserId(user.id);

  if (!googleConnection) {
    const state = createOAuthState(String(from.id));
    const url = `${getAppBaseUrl()}/google/oauth?state=${encodeURIComponent(state)}`;
    const keyboard = new InlineKeyboard().url("Google Calendar", url);
    const message = language === "ru"
      ? "Подключите Google Calendar, чтобы создавать общие календари и сохранять мероприятия."
      : "Connect Google Calendar to create shared calendars and save events.";

    return ctx.reply(message, { reply_markup: keyboard });
  }

  return ctx.reply(language === "ru" ? "Meetory запущен." : "Meetory is running.");
});

bot?.on("message:text", (ctx) => {
  return ctx.reply("Choose a calendar before saving an event.");
});
