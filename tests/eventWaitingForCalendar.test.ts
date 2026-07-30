import assert from "node:assert/strict";
import test from "node:test";
import { callbackData } from "../src/i18n/index.js";
import { parseEventWaitingForCalendarPayload } from "../src/events/eventWaitingForCalendar.js";

test("Create calendar button uses callback data handled by calendar create callback", () => {
  assert.equal(callbackData.createCalendar, "calendar:create");
});

test("event waiting for calendar payload preserves event input for resume after calendar creation", () => {
  const payload = parseEventWaitingForCalendarPayload(JSON.parse(JSON.stringify({
    text: "Beer Festival\n16 Aug, 18:00",
    forwardContext: "forward_origin:channel",
    detectedLinks: [
      {
        text: "Details",
        url: "https://event.example",
      },
      {
        text: "Map",
        url: "https://maps.app.goo.gl/place",
      },
    ],
    sourceIdentity: {
      chatId: "100",
      messageId: "200",
      updateId: "300",
    },
  })));

  assert.ok(payload);
  assert.equal(payload.text, "Beer Festival\n16 Aug, 18:00");
  assert.equal(payload.forwardContext, "forward_origin:channel");
  assert.deepEqual(payload.detectedLinks, [
    {
      text: "Details",
      url: "https://event.example",
    },
    {
      text: "Map",
      url: "https://maps.app.goo.gl/place",
    },
  ]);
  assert.deepEqual(payload.sourceIdentity, {
    chatId: "100",
    messageId: "200",
    updateId: "300",
  });
});

test("event waiting for calendar payload rejects missing text", () => {
  assert.equal(parseEventWaitingForCalendarPayload({
    detectedLinks: [],
    sourceIdentity: {},
  }), null);
});
