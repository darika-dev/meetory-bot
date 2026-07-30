import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getLocalizedBotCommands,
  registerLocalizedBotCommands,
} from "../src/telegram/botCommands.js";
import { messages } from "../src/i18n/index.js";

const botSource = readFileSync(new URL("../../src/bot.ts", import.meta.url), "utf8");
const setCommandsScript = readFileSync(new URL("../../scripts/set-commands.ts", import.meta.url), "utf8");

test("bot commands are localized for English and Russian", () => {
  assert.deepEqual(getLocalizedBotCommands("en"), [
    { command: "start", description: "Open Meetory" },
    { command: "help", description: "Help" },
    { command: "calendars", description: "My calendars" },
    { command: "newcalendar", description: "Create calendar" },
    { command: "today", description: "Today's events" },
    { command: "tomorrow", description: "Tomorrow's events" },
    { command: "weekend", description: "Weekend events" },
    { command: "settings", description: "Settings" },
  ]);

  assert.deepEqual(getLocalizedBotCommands("ru"), [
    { command: "start", description: "Открыть Meetory" },
    { command: "help", description: "Помощь" },
    { command: "calendars", description: "Мои календари" },
    { command: "newcalendar", description: "Создать календарь" },
    { command: "today", description: "События сегодня" },
    { command: "tomorrow", description: "События завтра" },
    { command: "weekend", description: "События на выходных" },
    { command: "settings", description: "Настройки" },
  ]);
});

test("command registration sets default English and Russian command lists", async () => {
  const calls: Array<{
    commands: ReturnType<typeof getLocalizedBotCommands>;
    options?: { language_code?: string };
  }> = [];

  await registerLocalizedBotCommands({
    async setMyCommands(commands, options) {
      calls.push({ commands, options });
    },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    commands: getLocalizedBotCommands("en"),
    options: undefined,
  });
  assert.deepEqual(calls[1], {
    commands: getLocalizedBotCommands("ru"),
    options: { language_code: "ru" },
  });
  assert.match(setCommandsScript, /registerLocalizedBotCommands\(bot\.api\)/);
});

test("/help uses localized public-facing help text", () => {
  assert.match(messages.help("en"), /Meetory helps you save events to your calendars/);
  assert.match(messages.help("en"), /forward an event announcement/);
  assert.match(messages.help("en"), /describe the event in your own words/);
  assert.doesNotMatch(messages.help("en"), /AI|GPT|LLM|OpenAI/i);

  assert.match(messages.help("ru"), /Meetory помогает сохранять события в ваши календари/);
  assert.match(messages.help("ru"), /перешлите сообщение с анонсом мероприятия/);
  assert.match(messages.help("ru"), /напишите событие своими словами/);
  assert.doesNotMatch(messages.help("ru"), /AI|GPT|LLM|OpenAI/i);
});

test("slash commands reuse existing navigation and event handlers", () => {
  assert.match(botSource, /bot\?\.command\("calendars"[\s\S]*return replyCalendarsList\(ctx, user\)/);
  assert.match(botSource, /bot\?\.command\("newcalendar"[\s\S]*return startCreateCalendarFlow\(ctx, user\)/);
  assert.match(botSource, /bot\?\.command\("today"[\s\S]*return replyEventsForRange\(ctx, user, "today"\)/);
  assert.match(botSource, /bot\?\.command\("tomorrow"[\s\S]*return replyEventsForRange\(ctx, user, "tomorrow"\)/);
  assert.match(botSource, /bot\?\.command\("weekend"[\s\S]*return replyEventsForRange\(ctx, user, "weekend"\)/);
  assert.match(botSource, /bot\?\.command\("settings"[\s\S]*return showSettingsMenu\(ctx, user\)/);
});

