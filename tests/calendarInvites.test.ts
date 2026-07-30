import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCalendarInviteLink,
  parseCalendarJoinStartPayload,
} from "../src/calendars/calendarInvites.js";
import {
  generateCalendarInviteToken,
  hashCalendarInviteToken,
  isValidCalendarInviteTokenShape,
} from "../src/calendars/calendarInviteTokens.js";
import {
  calendarInviteKeyboard,
  calendarInviteRegenerateCallbackData,
  calendarInviteReplyOptions,
  calendarJoinConfirmCallbackData,
  calendarJoinPreviewKeyboard,
  formatCalendarInviteMessage,
  formatCalendarJoinPreview,
} from "../src/telegramScreens.js";

const dbInit = readFileSync(new URL("../../db/init.sql", import.meta.url), "utf8");
const inviteRepository = readFileSync(new URL("../../src/repositories/calendarInvites.ts", import.meta.url), "utf8");

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

test("invite token is URL-safe and lookup uses hash, not raw token", () => {
  const rawToken = generateCalendarInviteToken();
  const tokenHash = hashCalendarInviteToken(rawToken);

  assert.match(rawToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(isValidCalendarInviteTokenShape(rawToken));
  assert.equal(tokenHash.length, 64);
  assert.notEqual(tokenHash, rawToken);
  assert.match(inviteRepository, /findValidInviteByTokenHash/);
  assert.doesNotMatch(inviteRepository, /rawToken/);
});

test("calendar_invites migration stores token hash and supports revoke/regenerate", () => {
  assert.match(dbInit, /CREATE TABLE IF NOT EXISTS calendar_invites/);
  assert.match(dbInit, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(dbInit, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(dbInit, /revoked_at TIMESTAMPTZ NULL/);
  assert.match(dbInit, /used_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(inviteRepository, /WITH revoked AS/);
  assert.match(inviteRepository, /SET revoked_at = NOW\(\)/);
  assert.match(inviteRepository, /INSERT INTO calendar_invites/);
  assert.match(inviteRepository, /used_count = used_count \+ 1/);
});

test("Telegram deep link parser accepts only join payload", () => {
  const token = generateCalendarInviteToken();

  assert.equal(parseCalendarJoinStartPayload(`/start join_${token}`), token);
  assert.equal(parseCalendarJoinStartPayload("/start"), null);
  assert.equal(parseCalendarJoinStartPayload("/start join_bad token"), null);
  assert.equal(parseCalendarJoinStartPayload("/start other_payload"), null);
});

test("invite link and invite screen use bot username and disable link preview", () => {
  const token = generateCalendarInviteToken();
  const link = buildCalendarInviteLink({
    botUsername: "MeetoryBot",
    rawToken: token,
  });
  const message = formatCalendarInviteMessage({
    language: "en",
    calendarName: "Hiking",
    inviteLink: link,
    ttlDays: 7,
  });
  const keyboard = calendarInviteKeyboard({
    language: "en",
    calendarId: "10",
    inviteLink: link,
  }).inline_keyboard;
  const options = calendarInviteReplyOptions({
    language: "en",
    calendarId: "10",
    inviteLink: link,
  });

  assert.equal(link, `https://t.me/MeetoryBot?start=join_${token}`);
  assert.match(message, /Invite to calendar/);
  assert.match(message, new RegExp(`join_${token}`));
  assert.deepEqual(options.link_preview_options, { is_disabled: true });
  assert.match(url(keyboard[0]?.[0]) ?? "", /^https:\/\/t\.me\/share\/url\?url=/);
  assert.equal(callback(keyboard[1]?.[0]), calendarInviteRegenerateCallbackData("10"));
});

test("join preview requires explicit confirmation", () => {
  const token = generateCalendarInviteToken();
  const message = formatCalendarJoinPreview({
    language: "ru",
    calendarName: "Походы",
    ownerName: "Дарья",
    memberCount: 3,
  });
  const keyboard = calendarJoinPreviewKeyboard({
    language: "ru",
    rawToken: token,
  }).inline_keyboard;

  assert.match(message, /Вас пригласили в календарь/);
  assert.match(message, /После присоединения/);
  assert.equal(callback(keyboard[0]?.[0]), calendarJoinConfirmCallbackData(token));
  assert.ok((callback(keyboard[0]?.[0]) ?? "").length <= 64);
});
