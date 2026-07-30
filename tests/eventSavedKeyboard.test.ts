import assert from "node:assert/strict";
import test from "node:test";
import { callbackData } from "../src/i18n/index.js";
import { eventSavedKeyboard } from "../src/telegramScreens.js";

function callback(button: unknown) {
  return typeof button === "object" &&
    button !== null &&
    "callback_data" in button &&
    typeof button.callback_data === "string"
    ? button.callback_data
    : null;
}

function url(button: unknown) {
  return typeof button === "object" &&
    button !== null &&
    "url" in button &&
    typeof button.url === "string"
    ? button.url
    : null;
}

test("event saved keyboard offers Calendar, Calendars, and Events actions", () => {
  const htmlLink = "https://calendar.google.com/calendar/event?eid=event-1";
  const keyboard = eventSavedKeyboard({ language: "en", htmlLink }).inline_keyboard;

  assert.equal(keyboard.length, 2);
  assert.equal(keyboard[0]?.length, 1);
  assert.equal(keyboard[0]?.[0]?.text, "📅 Open in Calendar");
  assert.equal(url(keyboard[0]?.[0]), htmlLink);

  assert.equal(keyboard[1]?.length, 2);
  assert.equal(keyboard[1]?.[0]?.text, "📅 Calendars");
  assert.equal(callback(keyboard[1]?.[0]), callbackData.listCalendars);
  assert.equal(keyboard[1]?.[1]?.text, "📋 Events");
  assert.equal(callback(keyboard[1]?.[1]), callbackData.eventsMenu);
});

test("event saved keyboard reuses Events callback without Google event link", () => {
  const keyboard = eventSavedKeyboard({ language: "ru" }).inline_keyboard;

  assert.equal(keyboard.length, 1);
  assert.equal(keyboard[0]?.length, 2);
  assert.equal(keyboard[0]?.[0]?.text, "📅 Календари");
  assert.equal(callback(keyboard[0]?.[0]), callbackData.listCalendars);
  assert.equal(keyboard[0]?.[1]?.text, "📋 События");
  assert.equal(callback(keyboard[0]?.[1]), callbackData.eventsMenu);
});
