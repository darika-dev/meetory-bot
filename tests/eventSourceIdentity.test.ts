import assert from "node:assert/strict";
import test from "node:test";
import { getTelegramEventSourceIdentity } from "../src/telegram/eventSourceIdentity.js";

test("source identity prefers forwarded channel origin over user DM message", () => {
  const firstUser = getTelegramEventSourceIdentity({
    updateId: 1001,
    message: {
      chat: { id: 10 },
      message_id: 501,
      forward_origin: {
        type: "channel",
        chat: { id: -100123 },
        message_id: 77,
      },
    },
  });
  const secondUser = getTelegramEventSourceIdentity({
    updateId: 1002,
    message: {
      chat: { id: 20 },
      message_id: 902,
      forward_origin: {
        type: "channel",
        chat: { id: -100123 },
        message_id: 77,
      },
    },
  });

  assert.deepEqual(firstUser, {
    chatId: "-100123",
    messageId: "77",
    updateId: "1001",
  });
  assert.equal(firstUser.chatId, secondUser.chatId);
  assert.equal(firstUser.messageId, secondUser.messageId);
});

test("source identity falls back to incoming message when origin has no stable message id", () => {
  assert.deepEqual(getTelegramEventSourceIdentity({
    updateId: 1003,
    message: {
      chat: { id: 10 },
      message_id: 501,
      forward_origin: {
        type: "user",
        sender_user: { id: 30 },
      },
    },
  }), {
    chatId: "10",
    messageId: "501",
    updateId: "1003",
  });
});

