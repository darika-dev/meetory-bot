import { addCalendarDays, buildLocalDateTime } from "../google/localDateTime.js";

export type EventRangeKind = "today" | "tomorrow" | "weekend" | "next7days";

export type EventRange = {
  kind: EventRangeKind;
  timeZone: string;
  rangeStart: Date;
  rangeEnd: Date;
  rangeStartIso: string;
  rangeEndIso: string;
  startLocalDate: string;
  endExclusiveLocalDate: string;
};

const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));

  return (asUtc - date.getTime()) / 60000;
}

export function localDateTimeToUtcDate(input: {
  date: string;
  time: string;
  timeZone: string;
}) {
  const localDateTime = buildLocalDateTime(input.date, input.time);
  const match = localDateTime.match(dateTimePattern);

  if (!match) {
    throw new Error("Invalid local datetime");
  }

  const [, year, month, day, hour, minute, second] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const firstOffset = getTimeZoneOffsetMinutes(input.timeZone, new Date(utcGuess));
  const first = utcGuess - firstOffset * 60000;
  const secondOffset = getTimeZoneOffsetMinutes(input.timeZone, new Date(first));

  return new Date(utcGuess - secondOffset * 60000);
}

export function getLocalDateTimeParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    seconds: get("second"),
  };
}

function localDateToWeekday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function buildRange(input: {
  kind: EventRangeKind;
  timeZone: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}) {
  const rangeStart = localDateTimeToUtcDate({
    date: input.startDate,
    time: input.startTime,
    timeZone: input.timeZone,
  });
  const rangeEnd = localDateTimeToUtcDate({
    date: input.endDate,
    time: input.endTime,
    timeZone: input.timeZone,
  });

  return {
    kind: input.kind,
    timeZone: input.timeZone,
    rangeStart,
    rangeEnd,
    rangeStartIso: rangeStart.toISOString(),
    rangeEndIso: rangeEnd.toISOString(),
    startLocalDate: input.startDate,
    endExclusiveLocalDate: input.endDate,
  } satisfies EventRange;
}

export function getTomorrowRange(input: { now: Date; timeZone: string }) {
  const local = getLocalDateTimeParts(input.now, input.timeZone);
  const tomorrow = addCalendarDays(local.date, 1);

  return buildRange({
    kind: "tomorrow",
    timeZone: input.timeZone,
    startDate: tomorrow,
    startTime: "00:00",
    endDate: addCalendarDays(tomorrow, 1),
    endTime: "00:00",
  });
}

export function getTodayRange(input: { now: Date; timeZone: string }) {
  const local = getLocalDateTimeParts(input.now, input.timeZone);

  return buildRange({
    kind: "today",
    timeZone: input.timeZone,
    startDate: local.date,
    startTime: local.time,
    endDate: addCalendarDays(local.date, 1),
    endTime: "00:00",
  });
}

export function getWeekendRange(input: { now: Date; timeZone: string }) {
  const local = getLocalDateTimeParts(input.now, input.timeZone);
  const weekday = localDateToWeekday(local.date);

  if (weekday === 6 || weekday === 0) {
    return buildRange({
      kind: "weekend",
      timeZone: input.timeZone,
      startDate: local.date,
      startTime: local.time,
      endDate: addCalendarDays(local.date, weekday === 6 ? 2 : 1),
      endTime: "00:00",
    });
  }

  const daysUntilSaturday = (6 - weekday + 7) % 7;
  const saturday = addCalendarDays(local.date, daysUntilSaturday);

  return buildRange({
    kind: "weekend",
    timeZone: input.timeZone,
    startDate: saturday,
    startTime: "00:00",
    endDate: addCalendarDays(saturday, 2),
    endTime: "00:00",
  });
}

export function getNextSevenDaysRange(input: { now: Date; timeZone: string }) {
  const local = getLocalDateTimeParts(input.now, input.timeZone);

  return buildRange({
    kind: "next7days",
    timeZone: input.timeZone,
    startDate: local.date,
    startTime: local.time,
    endDate: addCalendarDays(local.date, 7),
    endTime: local.time,
  });
}

export function getGoogleQueryRange(input: {
  range: EventRange;
  now: Date;
  timeZone: string;
}) {
  const local = getLocalDateTimeParts(input.now, input.timeZone);
  const startOfToday = localDateTimeToUtcDate({
    date: local.date,
    time: "00:00",
    timeZone: input.timeZone,
  });
  const shouldExpandToStartOfToday = input.range.startLocalDate === local.date
    && input.range.rangeStart > startOfToday;

  return {
    queryStart: shouldExpandToStartOfToday ? startOfToday : input.range.rangeStart,
    queryEnd: input.range.rangeEnd,
    queryStartIso: (shouldExpandToStartOfToday ? startOfToday : input.range.rangeStart).toISOString(),
    queryEndIso: input.range.rangeEndIso,
    expandedToStartOfToday: shouldExpandToStartOfToday,
  };
}
