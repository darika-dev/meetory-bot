import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { callbackData } from "../src/i18n/index.js";
import {
  calendarCardKeyboard,
  calendarLeaveCallbackData,
  calendarLeaveConfirmCallbackData,
  calendarLeaveConfirmKeyboard,
  calendarInviteCallbackData,
  calendarMemberRemoveConfirmCallbackData,
  calendarMemberRemoveConfirmKeyboard,
  calendarMemberRemoveListKeyboard,
  calendarMemberRemoveSelectCallbackData,
  calendarMembersCallbackData,
  calendarMembersKeyboard,
  calendarMembersRemoveCallbackData,
  formatCalendarMembers,
} from "../src/telegramScreens.js";

const botSource = readFileSync(new URL("../../src/bot.ts", import.meta.url), "utf8");

function callback(button: unknown) {
  return typeof button === "object" &&
    button !== null &&
    "callback_data" in button &&
    typeof button.callback_data === "string"
    ? button.callback_data
    : null;
}

test("calendar card shows members and owner admin actions", () => {
  const keyboard = calendarCardKeyboard({
    language: "en",
    calendarId: "10",
    isActive: true,
    canManage: true,
    canLeave: false,
  }).inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["👥 Members"],
    ["✏️ Rename"],
    ["🗑 Delete"],
    ["← Back"],
  ]);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [calendarMembersCallbackData("10")],
    ["calendar:rename:10"],
    ["calendar:delete:10"],
    [callbackData.listCalendars],
  ]);
});

test("calendar card hides owner actions and shows leave for regular members", () => {
  const keyboard = calendarCardKeyboard({
    language: "ru",
    calendarId: "10",
    isActive: true,
    canManage: false,
    canLeave: true,
  }).inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["👥 Участники"],
    ["🚪 Выйти из календаря"],
    ["← Назад"],
  ]);
  const buttonTexts = keyboard.map((row) => row.map((button) => button.text)).flat();

  assert.equal(buttonTexts.includes("✏️ Переименовать"), false);
  assert.equal(buttonTexts.includes("🗑 Удалить"), false);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [calendarMembersCallbackData("10")],
    [calendarLeaveCallbackData("10")],
    [callbackData.listCalendars],
  ]);
});

test("calendar members screen formats owner role without Telegram IDs", () => {
  const message = formatCalendarMembers({
    language: "en",
    calendarName: "Test Events",
    members: [
      { userId: "1", displayName: "Daria", role: "owner" },
      { userId: "2", displayName: "Maria", role: "member" },
    ],
  });

  assert.equal(
    message,
    [
      "👥 Members",
      "📅 Test Events",
      "",
      "• Daria — owner",
      "• Maria",
    ].join("\n"),
  );
  assert.doesNotMatch(message, /Telegram 123/);
});

test("owner members keyboard shows invite and remove flow when members exist", () => {
  const keyboard = calendarMembersKeyboard({
    language: "en",
    calendarId: "10",
    canManage: true,
    canLeave: false,
    members: [
      { userId: "1", displayName: "Daria", role: "owner" },
      { userId: "2", displayName: "Maria", role: "member" },
    ],
  }).inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["➕ Invite"],
    ["➖ Remove member"],
    ["← Back"],
  ]);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [calendarInviteCallbackData("10")],
    [calendarMembersRemoveCallbackData("10")],
    ["calendar:open:10"],
  ]);
});

test("owner members keyboard hides remove flow when owner is the only member", () => {
  const keyboard = calendarMembersKeyboard({
    language: "en",
    calendarId: "10",
    canManage: true,
    canLeave: false,
    members: [
      { userId: "1", displayName: "Daria", role: "owner" },
    ],
  }).inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["➕ Invite"],
    ["← Back"],
  ]);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [calendarInviteCallbackData("10")],
    ["calendar:open:10"],
  ]);
});

test("member remove list excludes owner and asks for confirmation", () => {
  const listKeyboard = calendarMemberRemoveListKeyboard({
    language: "en",
    calendarId: "10",
    members: [
      { userId: "1", displayName: "Daria", role: "owner" },
      { userId: "2", displayName: "Maria", role: "member" },
    ],
  }).inline_keyboard;

  assert.deepEqual(listKeyboard.map((row) => row.map((button) => button.text)), [
    ["Maria"],
    ["← Back"],
  ]);
  assert.deepEqual(listKeyboard.map((row) => row.map(callback)), [
    [calendarMemberRemoveSelectCallbackData("10", "2")],
    [calendarMembersCallbackData("10")],
  ]);

  const confirmKeyboard = calendarMemberRemoveConfirmKeyboard({
    language: "ru",
    calendarId: "10",
    userId: "2",
  }).inline_keyboard;

  assert.deepEqual(confirmKeyboard.map((row) => row.map((button) => button.text)), [
    ["✅ Удалить"],
    ["✖️ Отмена"],
  ]);
  assert.deepEqual(confirmKeyboard.map((row) => row.map(callback)), [
    [calendarMemberRemoveConfirmCallbackData("10", "2")],
    [calendarMembersCallbackData("10")],
  ]);
});

test("regular members screen can leave but has no administrative actions", () => {
  const keyboard = calendarMembersKeyboard({
    language: "ru",
    calendarId: "10",
    canManage: false,
    canLeave: true,
    members: [
      { userId: "1", displayName: "Daria", role: "owner" },
      { userId: "2", displayName: "Maria", role: "member" },
    ],
  }).inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["🚪 Выйти из календаря"],
    ["← Назад"],
  ]);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [calendarLeaveCallbackData("10")],
    ["calendar:open:10"],
  ]);
});

test("cancel calendar creation returns to Calendars list", () => {
  assert.match(botSource, /bot\?\.callbackQuery\("calendar:create:cancel"/);
  assert.match(botSource, /replyCalendarsList\(ctx, user, messages\.creationCancelled/);
  assert.doesNotMatch(botSource, /return ctx\.reply\(messages\.creationCancelled/);
});

test("leave confirmation uses compact callback data", () => {
  const keyboard = calendarLeaveConfirmKeyboard("en", "10").inline_keyboard;

  assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
    ["✅ Leave"],
    ["✖️ Cancel"],
  ]);
  assert.deepEqual(keyboard.map((row) => row.map(callback)), [
    [calendarLeaveConfirmCallbackData("10")],
    [calendarMembersCallbackData("10")],
  ]);
});
