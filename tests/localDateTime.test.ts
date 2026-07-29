import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleEventRequestBodies, type GoogleEventDraft } from "../src/google/calendarService.js";
import { addMinutesToLocalTime, buildLocalDateTime } from "../src/google/localDateTime.js";
import { buildConfirmEventPayload, parseConfirmEventPayload } from "../src/events/eventDraft.js";
import type { ParsedEvent } from "../src/ai/eventParser.js";

function timedDraft(overrides: Partial<GoogleEventDraft> = {}): GoogleEventDraft {
  return {
    scheduleType: "single",
    title: "Timezone test",
    startDate: "2026-08-01",
    startTime: "20:00",
    endDate: "2026-08-01",
    endTime: "23:00",
    isAllDay: false,
    location: null,
    description: null,
    eventUrl: null,
    locationUrl: null,
    sourceUrl: null,
    ...overrides,
  };
}

function getDateTime(value: unknown) {
  return (value as { dateTime?: string }).dateTime;
}

function parsedEvent(): ParsedEvent {
  return {
    isEvent: true,
    scheduleType: "single",
    title: "Telegram event",
    startDate: "2026-08-01",
    startTime: "20:00",
    endDate: "2026-08-01",
    endTime: "23:00",
    isAllDay: false,
    location: null,
    description: null,
    eventUrl: null,
    locationUrl: null,
    sourceUrl: null,
    confidence: 0.9,
    missingFields: [],
  };
}

test("buildLocalDateTime returns floating local datetime independent of process TZ", () => {
  const originalTz = process.env.TZ;

  try {
    for (const timeZone of ["UTC", "America/New_York"]) {
      process.env.TZ = timeZone;
      const result = buildLocalDateTime("2026-08-01", "20:00");

      assert.equal(result, "2026-08-01T20:00:00");
      assert.equal(result.includes("Z"), false);
      assert.equal(/[+-]\d{2}:\d{2}$/.test(result), false);
    }
  } finally {
    process.env.TZ = originalTz;
  }
});

test("addMinutesToLocalTime uses local calendar arithmetic", () => {
  assert.deepEqual(addMinutesToLocalTime("2026-08-01", "20:00", 60), {
    endDate: "2026-08-01",
    endTime: "21:00",
  });
  assert.deepEqual(addMinutesToLocalTime("2026-08-01", "23:30", 60), {
    endDate: "2026-08-02",
    endTime: "00:30",
  });
});

test("single timed request body uses local datetime and calendar timezone", () => {
  const [requestBody] = buildGoogleEventRequestBodies(timedDraft(), "Europe/Nicosia");

  assert.equal(getDateTime(requestBody.start), "2026-08-01T20:00:00");
  assert.equal(getDateTime(requestBody.end), "2026-08-01T23:00:00");
  assert.equal((requestBody.start as { timeZone?: string }).timeZone, "Europe/Nicosia");
});

test("confirm_event serialization path preserves local time for Google request", () => {
  const payload = buildConfirmEventPayload(parsedEvent(), "42", "00000000-0000-4000-8000-000000000000");
  const storedPayload = JSON.parse(JSON.stringify(payload));
  const draft = parseConfirmEventPayload(storedPayload);

  assert.ok(draft);
  assert.equal(draft.payloadVersion, 2);
  assert.equal(draft.eventTraceId, "00000000-0000-4000-8000-000000000000");
  assert.equal(draft.startDate, "2026-08-01");
  assert.equal(draft.startTime, "20:00");

  const [requestBody] = buildGoogleEventRequestBodies(draft, "Europe/Nicosia");

  assert.equal(getDateTime(requestBody.start), "2026-08-01T20:00:00");
  assert.equal((requestBody.start as { timeZone?: string }).timeZone, "Europe/Nicosia");
  assert.equal(getDateTime(requestBody.start)?.includes("Z"), false);
  assert.equal(/[+-]\d{2}:\d{2}$/.test(getDateTime(requestBody.start) ?? ""), false);
});

test("single cross-midnight request body moves end to next local date", () => {
  const [requestBody] = buildGoogleEventRequestBodies(timedDraft({
    endDate: null,
    endTime: "02:00",
  }), "Europe/Nicosia");

  assert.equal(getDateTime(requestBody.start), "2026-08-01T20:00:00");
  assert.equal(getDateTime(requestBody.end), "2026-08-02T02:00:00");
});

test("single missing end time uses default duration locally", () => {
  const [requestBody] = buildGoogleEventRequestBodies(timedDraft({
    startTime: "23:30",
    endDate: null,
    endTime: null,
  }), "Europe/Nicosia");

  assert.equal(getDateTime(requestBody.start), "2026-08-01T23:30:00");
  assert.equal(getDateTime(requestBody.end), "2026-08-02T00:30:00");
});

test("daily_range request bodies preserve local time and timezone", () => {
  const requestBodies = buildGoogleEventRequestBodies(timedDraft({
    scheduleType: "daily_range",
    startDate: "2026-07-31",
    endDate: "2026-08-02",
    startTime: "18:00",
    endTime: "23:00",
  }), "Europe/Nicosia");

  assert.equal(requestBodies.length, 3);
  assert.deepEqual(requestBodies.map((requestBody) => getDateTime(requestBody.start)), [
    "2026-07-31T18:00:00",
    "2026-08-01T18:00:00",
    "2026-08-02T18:00:00",
  ]);
  assert.deepEqual(requestBodies.map((requestBody) => (requestBody.start as { timeZone?: string }).timeZone), [
    "Europe/Nicosia",
    "Europe/Nicosia",
    "Europe/Nicosia",
  ]);
});

test("daily_range cross-midnight request bodies move each end to next local date", () => {
  const requestBodies = buildGoogleEventRequestBodies(timedDraft({
    scheduleType: "daily_range",
    startDate: "2026-07-31",
    endDate: "2026-08-02",
    startTime: "20:00",
    endTime: "02:00",
  }), "Europe/Nicosia");

  assert.deepEqual(requestBodies.map((requestBody) => getDateTime(requestBody.end)), [
    "2026-08-01T02:00:00",
    "2026-08-02T02:00:00",
    "2026-08-03T02:00:00",
  ]);
});
