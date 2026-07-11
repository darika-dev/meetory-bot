import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.TELEGRAM_API_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_API_TOKEN is required");
}

const bot = new Bot(token);
const info = await bot.api.getWebhookInfo();

console.log(JSON.stringify({
  url: info.url,
  pending_update_count: info.pending_update_count,
  last_error_date: info.last_error_date,
  last_error_message: info.last_error_message,
  max_connections: info.max_connections,
  allowed_updates: info.allowed_updates,
}, null, 2));
