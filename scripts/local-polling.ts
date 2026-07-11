import "dotenv/config";
import { bot } from "../src/bot.js";

if (!bot) {
  throw new Error("TELEGRAM_API_TOKEN is required");
}

await bot.api.deleteWebhook();

const me = await bot.api.getMe();

console.log(`Telegram webhook deleted. Starting local polling for @${me.username}...`);

await bot.start();
