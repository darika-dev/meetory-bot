import assert from "node:assert/strict";
import test from "node:test";
import { appendMeetorySignature } from "../src/google/meetorySignature.js";
import { buildGoogleEventRequestBodies, type GoogleEventDraft } from "../src/google/calendarService.js";

function googleDraft(overrides: Partial<GoogleEventDraft> = {}): GoogleEventDraft {
  return {
    scheduleType: "single",
    title: "Festival",
    startDate: "2026-08-01",
    startTime: "20:00",
    endDate: "2026-08-01",
    endTime: "23:00",
    isAllDay: false,
    location: "Limassol",
    price: null,
    description: "Описание",
    eventUrl: "https://event.example",
    locationUrl: "https://maps.example",
    sourceUrl: "https://source.example",
    ...overrides,
  };
}

function signatureCount(value: string) {
  return (value.match(/Saved with Meetory/g) ?? []).length;
}

test("appendMeetorySignature adds the signature to regular description", () => {
  assert.equal(
    appendMeetorySignature("Описание"),
    "Описание\n\nSaved with Meetory",
  );
});

test("appendMeetorySignature adds the signature to empty description", () => {
  assert.equal(appendMeetorySignature(undefined), "Saved with Meetory");
});

test("appendMeetorySignature keeps a single existing signature", () => {
  assert.equal(
    appendMeetorySignature("Описание\n\nSaved with Meetory"),
    "Описание\n\nSaved with Meetory",
  );
});

test("appendMeetorySignature normalizes repeated signatures to one", () => {
  assert.equal(
    appendMeetorySignature("Описание\n\nSaved with Meetory\n\nSaved with Meetory"),
    "Описание\n\nSaved with Meetory",
  );
});

test("appendMeetorySignature is idempotent", () => {
  const once = appendMeetorySignature("Описание");
  const twice = appendMeetorySignature(once);

  assert.equal(twice, once);
});

test("Google payloads contain one signature per occurrence and do not share mutable payloads", () => {
  const draft = googleDraft({
    scheduleType: "daily_range",
    startDate: "2026-07-31",
    endDate: "2026-08-02",
    description: "Описание",
  });
  const originalDraftDescription = draft.description;

  const requestBodies = buildGoogleEventRequestBodies(draft, "Europe/Nicosia");

  assert.equal(requestBodies.length, 3);
  assert.notEqual(requestBodies[0], requestBodies[1]);
  assert.notEqual(requestBodies[1], requestBodies[2]);

  for (const requestBody of requestBodies) {
    assert.equal(typeof requestBody.description, "string");
    assert.equal(signatureCount(requestBody.description as string), 1);
  }

  requestBodies[0].description = "changed";

  assert.match(requestBodies[1].description as string, /Saved with Meetory/);
  assert.equal(signatureCount(requestBodies[1].description as string), 1);
  assert.equal(draft.description, originalDraftDescription);
});
