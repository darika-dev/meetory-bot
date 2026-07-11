import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.TELEGRAM_API_TOKEN;
const appUrl = process.env.APP_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  throw new Error("TELEGRAM_API_TOKEN is required");
}

if (!appUrl) {
  throw new Error("APP_URL is required");
}

if (webhookSecret && !/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET may only contain A-Z, a-z, 0-9, _ and -");
}

const bot = new Bot(token);
const webhookUrl = `${appUrl.replace(/\/$/, "")}/telegram/webhook`;

await bot.api.setWebhook(webhookUrl, {
  secret_token: webhookSecret,
});

console.log(`Telegram webhook set to ${webhookUrl}`);
