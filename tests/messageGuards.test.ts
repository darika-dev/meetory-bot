import assert from "node:assert/strict";
import test from "node:test";
import { getBotIdFromToken, shouldIgnoreBotAuthoredMessage } from "../src/telegram/messageGuards.js";

test("extracts bot id from Telegram bot token", () => {
  assert.equal(getBotIdFromToken("123456:secret"), "123456");
  assert.equal(getBotIdFromToken("not-a-token"), null);
  assert.equal(getBotIdFromToken(undefined), null);
});

test("normal user-authored event is not ignored", () => {
  assert.equal(shouldIgnoreBotAuthoredMessage({
    ctxFrom: {
      id: 10,
      is_bot: false,
    },
    messageFrom: {
      id: 10,
      is_bot: false,
    },
    botId: 20,
  }), false);
});

test("message authored by Meetory bot is ignored", () => {
  assert.equal(shouldIgnoreBotAuthoredMessage({
    ctxFrom: {
      id: 20,
      is_bot: true,
    },
    messageFrom: {
      id: 20,
      is_bot: true,
    },
    botId: 20,
  }), true);
});

test("message authored by another bot is ignored", () => {
  assert.equal(shouldIgnoreBotAuthoredMessage({
    ctxFrom: {
      id: 30,
      is_bot: true,
    },
    messageFrom: {
      id: 30,
      is_bot: true,
    },
    botId: 20,
  }), true);
});

test("user-forwarded post originally created by a bot is still accepted", () => {
  assert.equal(shouldIgnoreBotAuthoredMessage({
    ctxFrom: {
      id: 10,
      is_bot: false,
    },
    messageFrom: {
      id: 10,
      is_bot: false,
    },
    botId: 20,
  }), false);
});

test("preview-like outgoing message is rejected when authored by a bot", () => {
  assert.equal(shouldIgnoreBotAuthoredMessage({
    ctxFrom: {
      id: 20,
      is_bot: true,
    },
    messageFrom: {
      id: 20,
      is_bot: true,
    },
    botId: 20,
  }), true);
});
