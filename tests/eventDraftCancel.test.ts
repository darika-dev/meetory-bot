import assert from "node:assert/strict";
import test from "node:test";
import { discardEventDraft } from "../src/events/eventDraftCancel.js";
import type { ConfirmEventPayload } from "../src/events/eventDraft.js";

function draft(overrides: Partial<ConfirmEventPayload> = {}): ConfirmEventPayload {
  return {
    payloadVersion: 2,
    eventTraceId: "trace-1",
    draftId: "draft-1",
    status: "ready",
    scheduleType: "single",
    title: "Cherry Festival",
    startDate: "2026-08-01",
    startTime: "20:00",
    endDate: null,
    endTime: null,
    isAllDay: false,
    location: "Trimiklini",
    price: null,
    description: null,
    sourceDescription: null,
    eventUrl: null,
    locationUrl: null,
    sourceUrl: null,
    sourceTelegramChatId: "100",
    sourceTelegramMessageId: "200",
    sourceTelegramUpdateId: "300",
    previewChatId: "400",
    previewMessageId: "500",
    calendarId: "42",
    ...overrides,
  };
}

test("discard event draft deletes preview, clears draft, and sends next-step message", async () => {
  const calls: string[] = [];

  await discardEventDraft({
    draft: draft(),
    discardedMessage: "✅ Draft discarded.\n\nForward another event whenever you're ready.",
    deletePreview: async (chatId, messageId) => {
      calls.push(`delete:${chatId}:${messageId}`);
    },
    clearDraft: async () => {
      calls.push("clear");
    },
    sendMessage: async (text) => {
      calls.push(`send:${text}`);
    },
  });

  assert.deepEqual(calls, [
    "delete:400:500",
    "clear",
    "send:✅ Draft discarded.\n\nForward another event whenever you're ready.",
  ]);
});

test("discard event draft still clears and responds when preview delete fails", async () => {
  const calls: string[] = [];

  await discardEventDraft({
    draft: draft(),
    discardedMessage: "✅ Черновик удалён.\n\nПерешлите другое мероприятие, когда будете готовы.",
    deletePreview: async () => {
      calls.push("delete");
      throw new Error("message can't be deleted");
    },
    clearDraft: async () => {
      calls.push("clear");
    },
    sendMessage: async (text) => {
      calls.push(`send:${text}`);
    },
    logPreviewDeleteError: (error) => {
      calls.push(`log:${error instanceof Error ? error.message : String(error)}`);
    },
  });

  assert.deepEqual(calls, [
    "delete",
    "log:message can't be deleted",
    "clear",
    "send:✅ Черновик удалён.\n\nПерешлите другое мероприятие, когда будете готовы.",
  ]);
});

test("discard event draft clears and responds even when there is no preview message", async () => {
  const calls: string[] = [];

  await discardEventDraft({
    draft: draft({
      previewChatId: null,
      previewMessageId: null,
    }),
    discardedMessage: "done",
    deletePreview: async () => {
      calls.push("delete");
    },
    clearDraft: async () => {
      calls.push("clear");
    },
    sendMessage: async (text) => {
      calls.push(`send:${text}`);
    },
  });

  assert.deepEqual(calls, ["clear", "send:done"]);
});
