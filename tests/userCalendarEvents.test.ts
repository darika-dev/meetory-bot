import assert from "node:assert/strict";
import test from "node:test";
import type { calendar_v3 } from "googleapis";
import { collectUserCalendarEvents, type UserMeetoryCalendar } from "../src/events/userCalendarEvents.js";
import { getTodayRange } from "../src/events/eventRanges.js";

const now = new Date("2026-07-30T13:00:00.000Z");
const timeZone = "Europe/Nicosia";

const calendars: UserMeetoryCalendar[] = [
  { id: "1", name: "Hiking", googleCalendarId: "hiking@google", timeZone: null },
  { id: "2", name: "Concerts", googleCalendarId: "concerts@google", timeZone: null },
  { id: "3", name: "Food", googleCalendarId: "food@google", timeZone: null },
];

function event(summary: string): calendar_v3.Schema$Event {
  return {
    id: summary,
    status: "confirmed",
    summary,
    start: { dateTime: "2026-07-30T18:00:00+03:00" },
    end: { dateTime: "2026-07-30T20:00:00+03:00" },
  };
}

test("collects events from multiple Meetory calendars and omits empty calendars", async () => {
  const result = await collectUserCalendarEvents({
    calendars,
    now,
    timeZone,
    range: getTodayRange({ now, timeZone }),
    loadEvents: async (calendar) => {
      if (calendar.name === "Hiking") {
        return [event("Evening walk")];
      }

      if (calendar.name === "Concerts") {
        return [event("Jazz Night")];
      }

      return [];
    },
  });

  assert.deepEqual(result.groups.map((group) => group.calendar.name), ["Hiking", "Concerts"]);
  assert.deepEqual(result.groups.flatMap((group) => group.events.current.map((item) => item.summary)), [
    "Evening walk",
    "Jazz Night",
  ]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.totalCalendars, 3);
});

test("isolates one calendar error and keeps successful groups", async () => {
  const result = await collectUserCalendarEvents({
    calendars,
    now,
    timeZone,
    range: getTodayRange({ now, timeZone }),
    loadEvents: async (calendar) => {
      if (calendar.name === "Hiking") {
        return [event("Evening walk")];
      }

      if (calendar.name === "Concerts") {
        const error = new Error("forbidden") as Error & { code?: number };
        error.code = 403;
        throw error;
      }

      return [];
    },
  });

  assert.deepEqual(result.groups.map((group) => group.calendar.name), ["Hiking"]);
  assert.deepEqual(result.errors.map((error) => error.calendar.name), ["Concerts"]);
  assert.equal(result.errors[0].kind, "calendar_access_denied");
});

test("returns errors for all calendars without treating them as an empty result", async () => {
  const result = await collectUserCalendarEvents({
    calendars: calendars.slice(0, 2),
    now,
    timeZone,
    range: getTodayRange({ now, timeZone }),
    loadEvents: async () => {
      const error = new Error("temporary") as Error & { code?: number };
      error.code = 503;
      throw error;
    },
  });

  assert.equal(result.groups.length, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.totalCalendars, 2);
});
