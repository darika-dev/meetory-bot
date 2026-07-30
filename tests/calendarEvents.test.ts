import assert from "node:assert/strict";
import test from "node:test";
import type { calendar_v3 } from "googleapis";
import {
  classifyGoogleCalendarEvents,
  formatCalendarEventGroupMessages,
  formatCalendarEventGroups,
  formatCalendarEvents,
  normalizeAndFilterGoogleEvents,
} from "../src/events/calendarEvents.js";
import { getNextSevenDaysRange } from "../src/events/eventRanges.js";
import {
  MEETORY_END_TIME_ESTIMATED,
  MEETORY_END_TIME_EXPLICIT,
  MEETORY_END_TIME_PROPERTY,
} from "../src/google/calendarService.js";

function event(overrides: calendar_v3.Schema$Event): calendar_v3.Schema$Event {
  return {
    id: "id",
    summary: "Untitled",
    status: "confirmed",
    ...overrides,
  };
}

function endTimeMetadata(value: string): calendar_v3.Schema$Event["extendedProperties"] {
  return {
    private: {
      [MEETORY_END_TIME_PROPERTY]: value,
    },
  };
}

test("ongoing events are included while completed events are excluded", () => {
  const range = getNextSevenDaysRange({
    now: new Date("2026-07-30T13:00:00.000Z"),
    timeZone: "Europe/Nicosia",
  });
  const events = normalizeAndFilterGoogleEvents([
    event({
      summary: "A ongoing",
      start: { dateTime: "2026-07-30T12:00:00+03:00" },
      end: { dateTime: "2026-07-30T22:00:00+03:00" },
    }),
    event({
      summary: "B completed",
      start: { dateTime: "2026-07-30T10:00:00+03:00" },
      end: { dateTime: "2026-07-30T15:00:00+03:00" },
    }),
    event({
      summary: "C future",
      start: { dateTime: "2026-07-30T18:00:00+03:00" },
      end: { dateTime: "2026-07-30T20:00:00+03:00" },
    }),
  ], range);

  assert.deepEqual(events.map((item) => item.summary), ["A ongoing", "C future"]);
});

test("all-day, multi-day, recurring instances and cancelled events are handled", () => {
  const range = getNextSevenDaysRange({
    now: new Date("2026-07-30T13:00:00.000Z"),
    timeZone: "Europe/Nicosia",
  });
  const events = normalizeAndFilterGoogleEvents([
    event({
      summary: "All-day",
      start: { date: "2026-07-31" },
      end: { date: "2026-08-01" },
    }),
    event({
      summary: "Recurring instance",
      recurringEventId: "series",
      start: { dateTime: "2026-08-01T18:00:00+03:00" },
      end: { dateTime: "2026-08-01T20:00:00+03:00" },
    }),
    event({
      summary: "Cancelled",
      status: "cancelled",
      start: { dateTime: "2026-08-01T18:00:00+03:00" },
      end: { dateTime: "2026-08-01T20:00:00+03:00" },
    }),
    event({
      summary: "Multi-day all-day",
      start: { date: "2026-08-02" },
      end: { date: "2026-08-04" },
    }),
  ], range);

  assert.deepEqual(events.map((item) => item.summary), [
    "All-day",
    "Recurring instance",
    "Multi-day all-day",
  ]);
});

test("formatter uses digest layout, groups by day, sorts all-day first, and formats locations", () => {
  const range = getNextSevenDaysRange({
    now: new Date("2026-07-30T13:00:00.000Z"),
    timeZone: "Europe/Nicosia",
  });
  const events = normalizeAndFilterGoogleEvents([
    event({
      summary: "Open-air cinema",
      location: "Molos",
      htmlLink: "https://calendar.google.com/event/open-air-cinema",
      start: { dateTime: "2026-07-31T18:00:00+03:00" },
      end: { dateTime: "2026-07-31T20:00:00+03:00" },
    }),
    event({
      summary: "Cherry Festival",
      location: "Trimiklini",
      start: { date: "2026-07-31" },
      end: { date: "2026-08-01" },
    }),
    event({
      summary: "Halloumi Festival",
      location: "Drousha",
      start: { dateTime: "2026-08-01T20:00:00+03:00" },
      end: { dateTime: "2026-08-01T21:00:00+03:00" },
    }),
  ], range);
  const [message] = formatCalendarEvents({
    events,
    language: "en",
    timeZone: "Europe/Nicosia",
  });

  assert.match(message, /Friday, July 31/);
  assert.doesNotMatch(message, /📅 Friday, July 31/);
  assert.match(message, /Friday, July 31\n• Cherry Festival, All day, Trimiklini/);
  assert.match(message, /• <a href="https:\/\/calendar\.google\.com\/event\/open-air-cinema">Open-air cinema<\/a>, 18:00–20:00, Molos/);
  assert.match(message, /Molos\n\nSaturday, August 1\n• Halloumi Festival, 20:00–21:00, Drousha/);
  assert.doesNotMatch(message, />https:\/\/calendar\.google\.com/);
  assert.doesNotMatch(message, /📍/);
  assert.doesNotMatch(message, /Friday, July 31\n\n•/);
  assert.doesNotMatch(message, /Saturday, August 1\n\n•/);
});

test("estimated technically completed event is shown as possibly still in progress", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const classified = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Cherry Festival",
        location: "Trimiklini",
        extendedProperties: endTimeMetadata(MEETORY_END_TIME_ESTIMATED),
        start: { dateTime: "2026-07-30T12:00:00+03:00" },
        end: { dateTime: "2026-07-30T13:00:00+03:00" },
      }),
    ],
  });

  assert.deepEqual(classified.current.map((item) => item.summary), []);
  assert.deepEqual(classified.possiblyStillInProgress.map((item) => item.summary), ["Cherry Festival"]);

  const [message] = formatCalendarEvents({
    events: classified,
    language: "en",
    timeZone: "Europe/Nicosia",
  });

  assert.match(message, /Possibly still in progress/);
  assert.match(message, /• Cherry Festival, 12:00, Trimiklini/);
  assert.doesNotMatch(message, /Started at/);
  assert.doesNotMatch(message, /End time not specified/);
  assert.doesNotMatch(message, /13:00/);
});

test("estimated event inside fallback hour is current but does not display fake end time", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const classified = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Late festival",
        extendedProperties: endTimeMetadata(MEETORY_END_TIME_ESTIMATED),
        start: { dateTime: "2026-07-30T15:30:00+03:00" },
        end: { dateTime: "2026-07-30T16:30:00+03:00" },
      }),
    ],
  });

  assert.deepEqual(classified.current.map((item) => item.summary), ["Late festival"]);
  assert.deepEqual(classified.possiblyStillInProgress, []);

  const [message] = formatCalendarEvents({
    events: classified,
    language: "en",
    timeZone: "Europe/Nicosia",
  });

  assert.match(message, /• Late festival, 15:30/);
  assert.doesNotMatch(message, /Starts at/);
  assert.doesNotMatch(message, /End time not specified/);
  assert.doesNotMatch(message, /15:30–16:30/);
});

test("estimated event from previous day and unknown metadata are not shown after technical end", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const classified = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Previous day estimated",
        extendedProperties: endTimeMetadata(MEETORY_END_TIME_ESTIMATED),
        start: { dateTime: "2026-07-29T20:00:00+03:00" },
        end: { dateTime: "2026-07-29T21:00:00+03:00" },
      }),
      event({
        summary: "Unknown metadata",
        start: { dateTime: "2026-07-30T12:00:00+03:00" },
        end: { dateTime: "2026-07-30T13:00:00+03:00" },
      }),
      event({
        summary: "Invalid metadata",
        extendedProperties: endTimeMetadata("something-else"),
        start: { dateTime: "2026-07-30T12:00:00+03:00" },
        end: { dateTime: "2026-07-30T13:00:00+03:00" },
      }),
    ],
  });

  assert.deepEqual(classified.current, []);
  assert.deepEqual(classified.possiblyStillInProgress, []);
});

test("explicit ongoing and completed events keep normal behavior", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const classified = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Explicit ongoing",
        extendedProperties: endTimeMetadata(MEETORY_END_TIME_EXPLICIT),
        start: { dateTime: "2026-07-30T12:00:00+03:00" },
        end: { dateTime: "2026-07-30T22:00:00+03:00" },
      }),
      event({
        summary: "Explicit completed",
        extendedProperties: endTimeMetadata(MEETORY_END_TIME_EXPLICIT),
        start: { dateTime: "2026-07-30T12:00:00+03:00" },
        end: { dateTime: "2026-07-30T15:00:00+03:00" },
      }),
    ],
  });

  assert.deepEqual(classified.current.map((item) => item.summary), ["Explicit ongoing"]);
  assert.deepEqual(classified.possiblyStillInProgress, []);
});

test("estimated formatting is localized in Russian and omits location when absent", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const classified = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Фестиваль вишни",
        extendedProperties: endTimeMetadata(MEETORY_END_TIME_ESTIMATED),
        start: { dateTime: "2026-07-30T12:00:00+03:00" },
        end: { dateTime: "2026-07-30T13:00:00+03:00" },
      }),
    ],
  });
  const [message] = formatCalendarEvents({
    events: classified,
    language: "ru",
    timeZone: "Europe/Nicosia",
  });

  assert.match(message, /Возможно, ещё идёт/);
  assert.match(message, /• Фестиваль вишни, 12:00/);
  assert.doesNotMatch(message, /Начало в 12:00/);
  assert.doesNotMatch(message, /Время окончания не указано/);
  assert.doesNotMatch(message, /📍/);
  assert.doesNotMatch(message, /13:00/);
});

test("group formatter orders by calendars, skips empty groups, and shows per-calendar errors", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const hiking = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Evening walk",
        location: "Troodos",
        start: { dateTime: "2026-07-30T18:00:00+03:00" },
        end: { dateTime: "2026-07-30T20:00:00+03:00" },
      }),
    ],
  });
  const concerts = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Jazz Night",
        location: "Limassol Marina",
        start: { dateTime: "2026-07-30T19:30:00+03:00" },
        end: { dateTime: "2026-07-30T22:00:00+03:00" },
      }),
    ],
  });
  const [message] = formatCalendarEventGroups({
    periodTitle: "📅 Today",
    groups: [
      { calendar: { name: "Hiking" }, events: hiking },
      { calendar: { name: "Concerts" }, events: concerts },
    ],
    errorCalendarNames: ["Food"],
    language: "en",
    timeZone: "Europe/Nicosia",
  });

  assert.doesNotMatch(message, /📅 Today/);
  assert.ok(message.startsWith("📅 <b>Hiking</b>"));
  assert.match(message, /📅 <b>Hiking<\/b>\nThursday, July 30\n• Evening walk, 18:00–20:00, Troodos/);
  assert.match(message, /📅 <b>Concerts<\/b>\nThursday, July 30\n• Jazz Night, 19:30–22:00, Limassol Marina/);
  assert.doesNotMatch(message, /📅 Thursday, July 30/);
  assert.doesNotMatch(message, /🗂 Hiking/);
  assert.doesNotMatch(message, /🗂 Concerts/);
  assert.match(message, /Couldn't load events from:\n• Food/);
  assert.ok(message.indexOf("📅 <b>Hiking</b>") < message.indexOf("📅 <b>Concerts</b>"));
});

test("group message formatter links event title and escapes HTML", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const events = classifyGoogleCalendarEvents({
    range,
    now,
    events: [
      event({
        summary: "Jazz <Night>",
        htmlLink: "https://calendar.google.com/event/jazz?x=1&y=2",
        start: { dateTime: "2026-07-30T19:30:00+03:00" },
        end: { dateTime: "2026-07-30T22:00:00+03:00" },
      }),
    ],
  });
  const [message] = formatCalendarEventGroupMessages({
    periodTitle: "📅 Today",
    groups: [{ calendar: { name: "Concerts" }, events }],
    language: "en",
    timeZone: "Europe/Nicosia",
  });

  assert.match(
    message.text,
    /• <a href="https:\/\/calendar\.google\.com\/event\/jazz\?x=1&amp;y=2">Jazz &lt;Night&gt;<\/a>, 19:30–22:00/,
  );
  assert.doesNotMatch(message.text, /📅 Open/);
});

test("formatter omits extra commas when event has no location", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({
    now,
    timeZone: "Europe/Nicosia",
  });
  const events = normalizeAndFilterGoogleEvents([
    event({
      summary: "No location event",
      start: { dateTime: "2026-07-31T18:00:00+03:00" },
      end: { dateTime: "2026-07-31T20:00:00+03:00" },
    }),
  ], range);
  const [message] = formatCalendarEvents({
    events,
    language: "en",
    timeZone: "Europe/Nicosia",
  });

  assert.match(message, /• No location event, 18:00–20:00/);
  assert.doesNotMatch(message, /20:00,/);
  assert.doesNotMatch(message, /,,/);
});
