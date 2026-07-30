import type { calendar_v3 } from "googleapis";
import { addCalendarDays } from "../google/localDateTime.js";
import type { Language } from "../i18n/index.js";
import { messages } from "../i18n/index.js";
import type { EventRange } from "./eventRanges.js";
import { getLocalDateTimeParts, localDateTimeToUtcDate } from "./eventRanges.js";
import {
  MEETORY_END_TIME_ESTIMATED,
  MEETORY_END_TIME_PROPERTY,
} from "../google/calendarService.js";

export type CalendarEventListItem = {
  id: string | null;
  htmlLink: string | null;
  summary: string;
  location: string | null;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startDateTime: Date;
  endDateTime: Date;
  endTimeEstimated: boolean;
};

export type ClassifiedCalendarEvents = {
  current: CalendarEventListItem[];
  possiblyStillInProgress: CalendarEventListItem[];
};

export type FormattedCalendarEventsMessage = {
  text: string;
};

type CalendarEventMessageLine = {
  text: string;
};

function getDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatTimeInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function parseDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function normalizeGoogleCalendarEvent(
  event: calendar_v3.Schema$Event,
  timeZone: string,
): CalendarEventListItem | null {
  if (event.status === "cancelled") {
    return null;
  }

  const summary = event.summary?.trim() || "(Untitled event)";
  const startDate = event.start?.date ?? null;
  const endDate = event.end?.date ?? null;

  if (startDate && endDate) {
    return {
      id: event.id ?? null,
      htmlLink: event.htmlLink ?? null,
      summary,
      location: event.location?.trim() || null,
      allDay: true,
      startDate,
      endDate,
      startDateTime: localDateTimeToUtcDate({ date: startDate, time: "00:00", timeZone }),
      endDateTime: localDateTimeToUtcDate({ date: endDate, time: "00:00", timeZone }),
      endTimeEstimated: false,
    };
  }

  const startDateTime = event.start?.dateTime ? parseDateTime(event.start.dateTime) : null;
  const endDateTime = event.end?.dateTime ? parseDateTime(event.end.dateTime) : null;

  if (!startDateTime || !endDateTime) {
    return null;
  }

  return {
    id: event.id ?? null,
    htmlLink: event.htmlLink ?? null,
    summary,
    location: event.location?.trim() || null,
    allDay: false,
    startDate: getDateInTimeZone(startDateTime, timeZone),
    endDate: getDateInTimeZone(endDateTime, timeZone),
    startDateTime,
    endDateTime,
    endTimeEstimated: event.extendedProperties?.private?.[MEETORY_END_TIME_PROPERTY] === MEETORY_END_TIME_ESTIMATED,
  };
}

export function eventIntersectsRange(event: CalendarEventListItem, range: Pick<EventRange, "rangeStart" | "rangeEnd">) {
  return event.endDateTime > range.rangeStart && event.startDateTime < range.rangeEnd;
}

export function normalizeAndFilterGoogleEvents(
  events: calendar_v3.Schema$Event[],
  range: EventRange,
) {
  return classifyGoogleCalendarEvents({
    events,
    range,
    now: range.rangeStart,
  }).current;
}

function sortEvents(events: CalendarEventListItem[]) {
  return [...events].sort((left, right) => {
    if (left.startDate !== right.startDate) {
      return left.startDate.localeCompare(right.startDate);
    }

    if (left.allDay !== right.allDay) {
      return left.allDay ? -1 : 1;
    }

    return left.startDateTime.getTime() - right.startDateTime.getTime();
  });
}

function isPossiblyStillInProgressEstimatedEvent(input: {
  event: CalendarEventListItem;
  range: EventRange;
  now: Date;
}) {
  if (input.event.allDay || !input.event.endTimeEstimated) {
    return false;
  }

  const today = getLocalDateTimeParts(input.now, input.range.timeZone).date;
  const startOfTomorrow = localDateTimeToUtcDate({
    date: addCalendarDays(today, 1),
    time: "00:00",
    timeZone: input.range.timeZone,
  });

  return input.event.startDate === today
    && input.event.endDateTime <= input.now
    && input.event.startDateTime < input.range.rangeEnd
    && input.range.rangeStart < startOfTomorrow
    && input.range.rangeEnd > input.now;
}

export function classifyGoogleCalendarEvents(input: {
  events: calendar_v3.Schema$Event[];
  range: EventRange;
  now: Date;
}): ClassifiedCalendarEvents {
  const normalized = input.events
    .map((event) => normalizeGoogleCalendarEvent(event, input.range.timeZone))
    .filter((event): event is CalendarEventListItem => Boolean(event));

  return {
    current: sortEvents(normalized.filter((event) => eventIntersectsRange(event, input.range))),
    possiblyStillInProgress: sortEvents(normalized.filter((event) =>
      !eventIntersectsRange(event, input.range)
      && isPossiblyStillInProgressEstimatedEvent({
        event,
        range: input.range,
        now: input.now,
      })
    )),
  };
}

function formatDayHeader(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatDateRange(startDate: string, endExclusiveDate: string, language: Language) {
  const endInclusive = addCalendarDays(endExclusiveDate, -1);
  const locale = language === "ru" ? "ru-RU" : "en-US";
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return startDate === endInclusive
    ? formatter.format(new Date(`${startDate}T00:00:00.000Z`))
    : formatter.formatRange(
      new Date(`${startDate}T00:00:00.000Z`),
      new Date(`${endInclusive}T00:00:00.000Z`),
    );
}

function formatEventTime(event: CalendarEventListItem, language: Language, timeZone: string) {
  if (event.allDay) {
    return event.startDate === addCalendarDays(event.endDate, -1)
      ? messages.eventListAllDay(language)
      : `${messages.eventListAllDay(language)}, ${formatDateRange(event.startDate, event.endDate, language)}`;
  }

  if (event.endTimeEstimated) {
    return formatTimeInTimeZone(event.startDateTime, timeZone);
  }

  return `${formatTimeInTimeZone(event.startDateTime, timeZone)}–${formatTimeInTimeZone(event.endDateTime, timeZone)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEventTitle(event: CalendarEventListItem) {
  const title = escapeHtml(event.summary);

  return event.htmlLink
    ? `<a href="${escapeHtml(event.htmlLink)}">${title}</a>`
    : title;
}

function eventLines(event: CalendarEventListItem, language: Language, timeZone: string): CalendarEventMessageLine[] {
  const parts = [
    formatEventTitle(event),
    formatEventTime(event, language, timeZone),
    event.location ? escapeHtml(event.location) : null,
  ].filter((part): part is string => Boolean(part));

  return [{ text: `• ${parts.join(", ")}` }];
}

function textLine(text: string): CalendarEventMessageLine {
  return { text };
}

function splitTelegramMessages(lines: CalendarEventMessageLine[]): FormattedCalendarEventsMessage[] {
  const chunks: FormattedCalendarEventsMessage[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line.text}` : line.text;

    if (next.length > 3500 && current) {
      chunks.push({
        text: current,
      });
      current = line.text;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push({
      text: current,
    });
  }

  return chunks;
}

export function formatCalendarEvents(input: {
  events: CalendarEventListItem[] | ClassifiedCalendarEvents;
  language: Language;
  timeZone: string;
}) {
  return formatCalendarEventMessages(input).map((message) => message.text);
}

export function formatCalendarEventMessages(input: {
  events: CalendarEventListItem[] | ClassifiedCalendarEvents;
  language: Language;
  timeZone: string;
}) {
  return splitTelegramMessages(buildCalendarEventLines(input));
}

function buildCalendarEventLines(input: {
  events: CalendarEventListItem[] | ClassifiedCalendarEvents;
  language: Language;
  timeZone: string;
}) {
  const lines: CalendarEventMessageLine[] = [];
  let currentDate: string | null = null;
  const currentEvents = Array.isArray(input.events) ? input.events : input.events.current;
  const possibleEvents = Array.isArray(input.events) ? [] : input.events.possiblyStillInProgress;

  for (const event of currentEvents) {
    if (event.startDate !== currentDate) {
      if (lines.length > 0) {
        lines.push(textLine(""));
      }

      currentDate = event.startDate;
      lines.push(textLine(formatDayHeader(currentDate, input.language)));
    }

    lines.push(...eventLines(event, input.language, input.timeZone));
  }

  const possibleByDate = new Map<string, CalendarEventListItem[]>();

  for (const event of possibleEvents) {
    possibleByDate.set(event.startDate, [...(possibleByDate.get(event.startDate) ?? []), event]);
  }

  for (const [date, events] of possibleByDate.entries()) {
    if (date !== currentDate) {
      if (lines.length > 0) {
        lines.push(textLine(""));
      }

      currentDate = date;
      lines.push(textLine(formatDayHeader(currentDate, input.language)));
    }

    lines.push(textLine(""), textLine(messages.eventListPossiblyStillInProgress(input.language)));

    for (const event of events) {
      lines.push(...eventLines(event, input.language, input.timeZone));
    }
  }

  return lines;
}

export function formatCalendarEventGroups(input: {
  periodTitle: string;
  groups: Array<{
    calendar: {
      name: string;
    };
    events: ClassifiedCalendarEvents;
  }>;
  errorCalendarNames?: string[];
  language: Language;
  timeZone: string;
}) {
  return formatCalendarEventGroupMessages(input).map((message) => message.text);
}

export function formatCalendarEventGroupMessages(input: {
  periodTitle: string;
  groups: Array<{
    calendar: {
      name: string;
    };
    events: ClassifiedCalendarEvents;
  }>;
  errorCalendarNames?: string[];
  language: Language;
  timeZone: string;
}) {
  const lines: CalendarEventMessageLine[] = [];

  for (const group of input.groups) {
    if (lines.length > 0) {
      lines.push(textLine(""));
    }

    lines.push(textLine(`📅 <b>${escapeHtml(group.calendar.name)}</b>`));
    lines.push(...buildCalendarEventLines({
      events: group.events,
      language: input.language,
      timeZone: input.timeZone,
    }));
  }

  if (input.errorCalendarNames && input.errorCalendarNames.length > 0) {
    lines.push(textLine(""), textLine(messages.calendarEventsLoadErrors(input.language)));

    for (const calendarName of input.errorCalendarNames) {
      lines.push(textLine(`• ${calendarName}`));
    }
  }

  return splitTelegramMessages(lines);
}
