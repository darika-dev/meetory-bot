import assert from "node:assert/strict";
import test from "node:test";
import {
  getTodayRange,
  getNextSevenDaysRange,
  getGoogleQueryRange,
  getTomorrowRange,
  getWeekendRange,
} from "../src/events/eventRanges.js";

const nicosia = "Europe/Nicosia";

test("tomorrow range uses next local calendar day and handles month transition", () => {
  const range = getTomorrowRange({
    now: new Date("2026-07-30T13:00:00.000Z"),
    timeZone: nicosia,
  });

  assert.equal(range.startLocalDate, "2026-07-31");
  assert.equal(range.endExclusiveLocalDate, "2026-08-01");
  assert.equal(range.rangeStartIso, "2026-07-30T21:00:00.000Z");
  assert.equal(range.rangeEndIso, "2026-07-31T21:00:00.000Z");
});

test("tomorrow range handles year transition", () => {
  const range = getTomorrowRange({
    now: new Date("2026-12-31T10:00:00.000Z"),
    timeZone: "UTC",
  });

  assert.equal(range.startLocalDate, "2027-01-01");
  assert.equal(range.endExclusiveLocalDate, "2027-01-02");
});

test("tomorrow range handles DST calendar day length", () => {
  const range = getTomorrowRange({
    now: new Date("2026-03-28T12:00:00.000Z"),
    timeZone: "Europe/Berlin",
  });

  assert.equal(range.startLocalDate, "2026-03-29");
  assert.equal(range.rangeStartIso, "2026-03-28T23:00:00.000Z");
  assert.equal(range.rangeEndIso, "2026-03-29T22:00:00.000Z");
});

test("weekend range from Monday points to nearest Saturday and Monday", () => {
  const range = getWeekendRange({
    now: new Date("2026-07-27T09:00:00.000Z"),
    timeZone: nicosia,
  });

  assert.equal(range.startLocalDate, "2026-08-01");
  assert.equal(range.endExclusiveLocalDate, "2026-08-03");
});

test("weekend range from Friday points to upcoming weekend", () => {
  const range = getWeekendRange({
    now: new Date("2026-07-31T09:00:00.000Z"),
    timeZone: nicosia,
  });

  assert.equal(range.startLocalDate, "2026-08-01");
  assert.equal(range.endExclusiveLocalDate, "2026-08-03");
});

test("weekend range from Saturday starts at now", () => {
  const range = getWeekendRange({
    now: new Date("2026-08-01T13:00:00.000Z"),
    timeZone: nicosia,
  });

  assert.equal(range.startLocalDate, "2026-08-01");
  assert.equal(range.rangeStartIso, "2026-08-01T13:00:00.000Z");
  assert.equal(range.endExclusiveLocalDate, "2026-08-03");
});

test("weekend range from Sunday does not jump to next weekend", () => {
  const range = getWeekendRange({
    now: new Date("2026-08-02T13:00:00.000Z"),
    timeZone: nicosia,
  });

  assert.equal(range.startLocalDate, "2026-08-02");
  assert.equal(range.endExclusiveLocalDate, "2026-08-03");
});

test("next seven days starts from now and ends seven local calendar days later", () => {
  const range = getNextSevenDaysRange({
    now: new Date("2026-07-30T13:00:00.000Z"),
    timeZone: nicosia,
  });

  assert.equal(range.startLocalDate, "2026-07-30");
  assert.equal(range.rangeStartIso, "2026-07-30T13:00:00.000Z");
  assert.equal(range.endExclusiveLocalDate, "2026-08-06");
  assert.equal(range.rangeEndIso, "2026-08-06T13:00:00.000Z");
});

test("today range starts at now and ends at next local midnight", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const today = getTodayRange({ now, timeZone: nicosia });

  assert.equal(today.rangeStartIso, "2026-07-30T13:00:00.000Z");
  assert.equal(today.rangeEndIso, "2026-07-30T21:00:00.000Z");
});

test("Google query range expands today next 7 days to start of day", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const range = getNextSevenDaysRange({ now, timeZone: nicosia });
  const query = getGoogleQueryRange({ range, now, timeZone: nicosia });

  assert.equal(range.rangeStartIso, "2026-07-30T13:00:00.000Z");
  assert.equal(query.queryStartIso, "2026-07-29T21:00:00.000Z");
  assert.equal(query.queryEndIso, range.rangeEndIso);
  assert.equal(query.expandedToStartOfToday, true);
});

test("Google query range expands weekend on Saturday to start of Saturday", () => {
  const now = new Date("2026-08-01T13:00:00.000Z");
  const range = getWeekendRange({ now, timeZone: nicosia });
  const query = getGoogleQueryRange({ range, now, timeZone: nicosia });

  assert.equal(range.rangeStartIso, "2026-08-01T13:00:00.000Z");
  assert.equal(query.queryStartIso, "2026-07-31T21:00:00.000Z");
});

test("Google query range expands weekend on Sunday to start of Sunday", () => {
  const now = new Date("2026-08-02T13:00:00.000Z");
  const range = getWeekendRange({ now, timeZone: nicosia });
  const query = getGoogleQueryRange({ range, now, timeZone: nicosia });

  assert.equal(query.queryStartIso, "2026-08-01T21:00:00.000Z");
});

test("Google query range expands today to start of day", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const today = getTodayRange({ now, timeZone: nicosia });
  const query = getGoogleQueryRange({ range: today, now, timeZone: nicosia });

  assert.equal(query.queryStartIso, "2026-07-29T21:00:00.000Z");
  assert.equal(query.queryEndIso, today.rangeEndIso);
});

test("Google query range does not expand tomorrow", () => {
  const now = new Date("2026-07-30T13:00:00.000Z");
  const tomorrow = getTomorrowRange({ now, timeZone: nicosia });

  assert.equal(getGoogleQueryRange({ range: tomorrow, now, timeZone: nicosia }).queryStartIso, tomorrow.rangeStartIso);
});
