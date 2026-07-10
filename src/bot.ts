import { Bot } from "grammy";
import * as usersRepository from "./repositories/users.ts";

const token = process.env.TELEGRAM_API_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_API_TOKEN is required");
}

export const bot = new Bot(token);

bot.command("start", async (ctx) => {
  const from = ctx.from;

  if (from) {
    const existingUser = await usersRepository.findByTelegramId(from.id);
    const profile = {
      telegramUsername: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      language: from.language_code,
    };

    if (existingUser) {
      await usersRepository.updateProfile(from.id, profile);
    } else {
      await usersRepository.create({
        telegramId: from.id,
        ...profile,
      });
    }
  }

  return ctx.reply("Meetory is running.");
});

bot.on("message:text", (ctx) => {
  return ctx.reply("Choose a calendar before saving an event.");
});
