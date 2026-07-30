import assert from "node:assert/strict";
import test from "node:test";
import { callbackData } from "../src/i18n/index.js";
import {
  calendarEventsReplyOptions,
  eventsMenuKeyboard,
  mainCalendarKeyboard,
} from "../src/telegramScreens.js";

function callback(button: unknown) {
  return typeof button === "object" &&
    button !== null &&
    "callback_data" in button &&
    typeof button.callback_data === "string"
    ? button.callback_data
    : null;
}

test("events menu uses two columns and keeps Back on a separate row", () => {
  const keyboard = eventsMenuKeyboard("ru").inline_keyboard;

  assert.equal(keyboard.length, 3);
  assert.deepEqual(keyboard[0]?.map((button) => button.text), ["Сегодня", "Завтра"]);
  assert.deepEqual(keyboard[0]?.map(callback), [callbackData.eventsToday, callbackData.eventsTomorrow]);
  assert.deepEqual(keyboard[1]?.map((button) => button.text), ["Выходные", "7 дней"]);
  assert.deepEqual(keyboard[1]?.map(callback), [callbackData.eventsWeekend, callbackData.eventsNext7Days]);
  assert.deepEqual(keyboard[2]?.map((button) => button.text), ["← Назад"]);
  assert.deepEqual(keyboard[2]?.map(callback), [callbackData.mainMenu]);
});

test("main menu uses the shared Calendars then Events order", () => {
  const keyboard = mainCalendarKeyboard("en").inline_keyboard;

  assert.equal(keyboard.length, 2);
  assert.deepEqual(keyboard[0]?.map((button) => button.text), ["📅 Calendars", "📋 Events"]);
  assert.deepEqual(keyboard[0]?.map(callback), [callbackData.listCalendars, callbackData.eventsMenu]);
  assert.deepEqual(keyboard[1]?.map((button) => button.text), ["➕ New calendar"]);
  assert.deepEqual(keyboard[1]?.map(callback), [callbackData.createCalendar]);
});

test("calendar events reply options use HTML and disable link preview", () => {
  const options = calendarEventsReplyOptions({
    language: "en",
    includeNavigation: true,
  });

  assert.equal(options.parse_mode, "HTML");
  assert.deepEqual(options.link_preview_options, { is_disabled: true });
  assert.ok(options.reply_markup);
});
