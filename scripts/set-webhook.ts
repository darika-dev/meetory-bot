import "dotenv/config";
import { Bot } from "grammy";
import { getAppBaseUrl } from "../src/config.js";

const token = process.env.TELEGRAM_API_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_API_TOKEN is required");
}

const bot = new Bot(token);
const webhookUrl = `${getAppBaseUrl()}/telegram/webhook`;

await bot.api.setWebhook(webhookUrl, {
  secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
});

console.log(`Telegram webhook set to ${webhookUrl}`);
