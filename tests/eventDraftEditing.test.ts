import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleEventRequestBodies } from "../src/google/calendarService.js";
import {
  updateDraftField,
  type EventEditField,
} from "../src/events/eventDraftEditing.js";
import type { ConfirmEventPayload } from "../src/events/eventDraft.js";
import {
  eventCalendarSelectionKeyboard,
  eventDraftKeyboard,
  eventEditFieldKeyboard,
  eventEditMenuKeyboard,
} from "../src/telegramScreens.js";

function draft(overrides: Partial<ConfirmEventPayload> = {}): ConfirmEventPayload {
  return {
    payloadVersion: 2,
    eventTraceId: "00000000-0000-4000-8000-000000000001",
    draftId: "00000000-0000-4000-8000-000000000002",
    status: "ready",
    scheduleType: "single",
    title: "Beer Festival",
    startDate: "2026-08-16",
    startTime: "18:00",
    endDate: "2026-08-16",
    endTime: "21:00",
    isAllDay: false,
    location: "Limassol",
    price: "€10",
    description: null,
    sourceDescription: "Original description",
    eventUrl: "https://event.example",
    locationUrl: "https://maps.example",
    sourceUrl: "https://source.example",
    sourceTelegramChatId: "100",
    sourceTelegramMessageId: "200",
    sourceTelegramUpdateId: "300",
    previewChatId: "100",
    previewMessageId: "201",
    calendarId: "42",
    ...overrides,
  };
}

function assertDraft(value: ConfirmEventPayload | { error: string }): asserts value is ConfirmEventPayload {
  assert.equal("error" in value, false);
}

test("edit menu contains only MVP text fields", () => {
  const callbackData = eventEditMenuKeyboard("en", "draft-1").inline_keyboard
    .flat()
    .map((button) => "callback_data" in button ? button.callback_data : null)
    .filter((value): value is string => Boolean(value));

  assert.deepEqual(callbackData, [
    "event:edit:draft-1:title",
    "event:edit:draft-1:location",
    "event:edit:draft-1:price",
    "event:edit:draft-1:description",
    "event:back:draft-1",
  ]);
});

test("draft preview actions are scoped to the draft id", () => {
  const keyboard = eventDraftKeyboard("en", "Meetory", "draft-a").inline_keyboard;
  const callbackData = keyboard
    .flat()
    .map((button) => "callback_data" in button ? button.callback_data : null)
    .filter((value): value is string => Boolean(value));

  assert.deepEqual(callbackData, [
    "event:calendar:draft-a",
    "event:save:draft-a",
    "event:edit:draft-a",
    "event:cancel:draft-a",
  ]);
});

test("calendar selection actions keep the draft id for every calendar", () => {
  const keyboard = eventCalendarSelectionKeyboard({
    language: "en",
    draftId: "draft-b",
    selectedCalendarId: "2",
    calendars: [
      { id: "1", summary: "Food" },
      { id: "2", summary: "Music" },
    ],
  }).inline_keyboard;
  const callbackData = keyboard
    .flat()
    .map((button) => "callback_data" in button ? button.callback_data : null)
    .filter((value): value is string => Boolean(value));

  assert.deepEqual(callbackData, [
    "event:calendar:draft-b:1",
    "event:calendar:draft-b:2",
    "event:back:draft-b",
  ]);
});

test("edit field keyboard returns to the same draft", () => {
  const keyboard = eventEditFieldKeyboard("en", "draft-c").inline_keyboard;
  const callbackData = keyboard
    .flat()
    .map((button) => "callback_data" in button ? button.callback_data : null)
    .filter((value): value is string => Boolean(value));

  assert.deepEqual(callbackData, [
    "event:edit:draft-c",
    "event:cancel:draft-c",
  ]);
});

test("updates title only", () => {
  const original = draft();
  const updated = updateDraftField(original, "title", "Halloumi Festival");

  assertDraft(updated);
  assert.equal(updated.title, "Halloumi Festival");
  assert.equal(updated.startDate, original.startDate);
  assert.equal(updated.location, original.location);
  assert.equal(updated.sourceDescription, original.sourceDescription);
});

test("updates location only", () => {
  const updated = updateDraftField(draft(), "location", "Paphos");

  assertDraft(updated);
  assert.equal(updated.location, "Paphos");
  assert.equal(updated.price, "€10");
});

test("updates price only", () => {
  const updated = updateDraftField(draft(), "price", "Donation");

  assertDraft(updated);
  assert.equal(updated.price, "Donation");
  assert.equal(updated.location, "Limassol");
});

test("updates description only and preserves formatting", () => {
  const description = ["Line one", "", "🍝 Line two", "https://example.com"].join("\n");
  const updated = updateDraftField(draft(), "description", description);

  assertDraft(updated);
  assert.equal(updated.sourceDescription, description);
  assert.equal(updated.title, "Beer Festival");
});

test("Save uses edited draft values for Google request", () => {
  let updated: ConfirmEventPayload = draft();

  for (const [field, value] of [
    ["title", "Updated title"],
    ["location", "Updated location"],
    ["price", "Free"],
    ["description", "Updated\n\n📄 description"],
  ] as Array<[EventEditField, string]>) {
    updated = updateDraftField(updated, field, value);
  }

  const [requestBody] = buildGoogleEventRequestBodies(updated, "Europe/Nicosia");

  assert.equal(requestBody.summary, "Updated title");
  assert.equal(requestBody.location, "Updated location");
  assert.equal((requestBody.start as { dateTime?: string }).dateTime, "2026-08-16T18:00:00");
  assert.equal((requestBody.end as { dateTime?: string }).dateTime, "2026-08-16T21:00:00");
  assert.match(requestBody.description as string, /Updated\n\n📄 description/);
  assert.match(requestBody.description as string, /Price:\nFree/);
  assert.doesNotMatch(requestBody.description as string, /Original description/);
});
