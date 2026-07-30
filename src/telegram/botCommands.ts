import type { Language } from "../i18n/index.js";
import { messages } from "../i18n/index.js";

export type TelegramBotCommand = {
  command: string;
  description: string;
};

export type TelegramBotCommandApi = {
  setMyCommands(
    commands: TelegramBotCommand[],
    options?: { language_code?: string },
  ): Promise<unknown>;
};

const COMMAND_ORDER = [
  "start",
  "help",
  "calendars",
  "newcalendar",
  "today",
  "tomorrow",
  "weekend",
  "settings",
] as const;

export function getLocalizedBotCommands(language: Language): TelegramBotCommand[] {
  const descriptions = messages.commandDescriptions(language);

  return COMMAND_ORDER.map((command) => ({
    command,
    description: command === "newcalendar"
      ? descriptions.newCalendar
      : descriptions[command],
  }));
}

export async function registerLocalizedBotCommands(api: TelegramBotCommandApi) {
  await api.setMyCommands(getLocalizedBotCommands("en"));
  await api.setMyCommands(getLocalizedBotCommands("ru"), {
    language_code: "ru",
  });
}

