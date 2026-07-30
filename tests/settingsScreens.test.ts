import assert from "node:assert/strict";
import test from "node:test";
import { callbackData } from "../src/i18n/index.js";
import {
  buildTimeKeyboardRows,
  formatSettingsMessage,
  formatTomorrowDigestSettings,
  formatWeekendDigestSettings,
  languageSettingsKeyboard,
  settingsKeyboard,
  settingsTimeCallbackData,
  settingsWeekendDayCallbackData,
  tomorrowDigestSettingsKeyboard,
  weekendDigestSettingsKeyboard,
} from "../src/telegramScreens.js";

function callback(button: unknown) {
  return typeof button === "object" &&
    button !== null &&
    "callback_data" in button &&
    typeof button.callback_data === "string"
    ? button.callback_data
    : null;
}

test("settings summary formats language, digest schedules, and timezone", () => {
  const message = formatSettingsMessage({
    language: "en",
    selectedLanguage: "en",
    tomorrowDigestEnabled: true,
    tomorrowDigestTime: "19:00",
    weekendDigestEnabled: true,
    weekendDigestWeekday: 4,
    weekendDigestTime: "19:00",
    timeZone: "Asia/Nicosia",
  });

  assert.match(message, /⚙️ Settings/);
  assert.match(message, /🌐 Language\nEnglish/);
  assert.match(message, /🌤 Tomorrow digest\nDaily at 19:00/);
  assert.match(message, /🎉 Weekend digest\nThursday at 19:00/);
  assert.match(message, /Time zone: Asia\/Nicosia/);
});

test("settings summary formats disabled digests in Russian", () => {
  const message = formatSettingsMessage({
    language: "ru",
    selectedLanguage: "ru",
    tomorrowDigestEnabled: false,
    tomorrowDigestTime: "19:00",
    weekendDigestEnabled: false,
    weekendDigestWeekday: 4,
    weekendDigestTime: "19:00",
    timeZone: "Asia/Nicosia",
  });

  assert.match(message, /🌐 Язык\nРусский/);
  assert.match(message, /🌤 Дайджест на завтра\nОтключён/);
  assert.match(message, /🎉 Дайджест на выходные\nОтключён/);
  assert.match(message, /Часовой пояс: Asia\/Nicosia/);
});

test("settings keyboard routes to language, digest screens, and back", () => {
  const keyboard = settingsKeyboard("en").inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["🌐 Language"],
    ["🌤 Tomorrow digest"],
    ["🎉 Weekend digest"],
    ["← Back"],
  ]);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [callbackData.settingsLanguage],
    [callbackData.settingsTomorrowDigest],
    [callbackData.settingsWeekendDigest],
    [callbackData.mainMenu],
  ]);
});

test("language settings keyboard marks current language", () => {
  const keyboard = languageSettingsKeyboard("ru", "ru").inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["English"],
    ["✅ Русский"],
    ["← Назад"],
  ]);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [callbackData.settingsLanguageEn],
    [callbackData.settingsLanguageRu],
    [callbackData.settingsMenu],
  ]);
});

test("tomorrow digest settings supports toggle and time choices", () => {
  const message = formatTomorrowDigestSettings({
    language: "en",
    enabled: true,
    time: "19:00",
  });
  const keyboard = tomorrowDigestSettingsKeyboard({
    language: "en",
    enabled: true,
    time: "19:00",
  }).inline_keyboard;

  assert.match(message, /🌤 Tomorrow digest/);
  assert.match(message, /Enabled/);
  assert.equal(callback(keyboard[0]?.[0]), callbackData.settingsTomorrowToggle);
  assert.deepEqual(keyboard[1]?.map(callback), [
    settingsTimeCallbackData("tomorrow", "09:00"),
    settingsTimeCallbackData("tomorrow", "12:00"),
  ]);
  assert.deepEqual(keyboard[2]?.map(callback), [
    settingsTimeCallbackData("tomorrow", "19:00"),
    settingsTimeCallbackData("tomorrow", "21:00"),
  ]);
  assert.equal(keyboard[2]?.[0]?.text, "✅ 19:00");
  assert.deepEqual(keyboard[3]?.map(callback), [callbackData.settingsMenu]);
});

test("weekend digest settings supports toggle, weekday, and time choices", () => {
  const message = formatWeekendDigestSettings({
    language: "en",
    enabled: true,
    weekday: 4,
    time: "19:00",
  });
  const keyboard = weekendDigestSettingsKeyboard({
    language: "en",
    enabled: true,
    weekday: 4,
    time: "19:00",
  }).inline_keyboard;

  assert.match(message, /🎉 Weekend digest/);
  assert.match(message, /Thursday at 19:00/);
  assert.equal(callback(keyboard[0]?.[0]), callbackData.settingsWeekendToggle);
  assert.deepEqual(keyboard[1]?.map(callback), [
    settingsWeekendDayCallbackData(4),
    settingsWeekendDayCallbackData(5),
  ]);
  assert.equal(keyboard[1]?.[0]?.text, "✅ Thursday");
  assert.deepEqual(keyboard[2]?.map(callback), [
    settingsTimeCallbackData("weekend", "09:00"),
    settingsTimeCallbackData("weekend", "12:00"),
  ]);
  assert.deepEqual(keyboard[3]?.map(callback), [
    settingsTimeCallbackData("weekend", "19:00"),
    settingsTimeCallbackData("weekend", "21:00"),
  ]);
  assert.equal(keyboard[3]?.[0]?.text, "✅ 19:00");
  assert.deepEqual(keyboard[4]?.map(callback), [callbackData.settingsMenu]);
});

test("time keyboard builder splits any option count into two columns", () => {
  assert.deepEqual(
    buildTimeKeyboardRows({
      kind: "tomorrow",
      options: ["09:00", "12:00", "19:00", "21:00"],
      selectedTime: "12:00",
    }),
    [
      [
        { text: "09:00", callbackData: settingsTimeCallbackData("tomorrow", "09:00") },
        { text: "✅ 12:00", callbackData: settingsTimeCallbackData("tomorrow", "12:00") },
      ],
      [
        { text: "19:00", callbackData: settingsTimeCallbackData("tomorrow", "19:00") },
        { text: "21:00", callbackData: settingsTimeCallbackData("tomorrow", "21:00") },
      ],
    ],
  );

  assert.deepEqual(
    buildTimeKeyboardRows({
      kind: "weekend",
      options: ["08:00", "13:00", "17:30"],
      selectedTime: "17:30",
    }),
    [
      [
        { text: "08:00", callbackData: settingsTimeCallbackData("weekend", "08:00") },
        { text: "13:00", callbackData: settingsTimeCallbackData("weekend", "13:00") },
      ],
      [{ text: "✅ 17:30", callbackData: settingsTimeCallbackData("weekend", "17:30") }],
    ],
  );
});
