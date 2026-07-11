import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.TELEGRAM_API_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_API_TOKEN is required");
}

const bot = new Bot(token);

await bot.api.setMyCommands([
  {
    command: "start",
    description: "Open Meetory",
  },
  {
    command: "newcalendar",
    description: "Create a calendar",
  },
  {
    command: "calendars",
    description: "Show calendars",
  },
  {
    command: "disconnect",
    description: "Disconnect Google Calendar",
  },
  {
    command: "help",
    description: "Show help",
  },
]);

console.log("Telegram commands set.");
