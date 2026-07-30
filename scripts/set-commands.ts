import "dotenv/config";
import { Bot } from "grammy";
import { registerLocalizedBotCommands } from "../src/telegram/botCommands.js";

const token = process.env.TELEGRAM_API_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_API_TOKEN is required");
}

const bot = new Bot(token);

await registerLocalizedBotCommands(bot.api);

console.log("Telegram commands set.");
