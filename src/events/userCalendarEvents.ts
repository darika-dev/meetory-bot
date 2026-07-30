import type { Calendar } from "../repositories/calendars.js";
import type { calendar_v3 } from "googleapis";
import { CalendarGoogleConnectionUnavailableError } from "../calendars/calendarGoogleConnection.js";
import * as calendarsRepository from "../repositories/calendars.js";
import { classifyGoogleApiError, type GoogleApiErrorKind } from "../google/googleApiErrors.js";
import { getCalendarEvents } from "../google/calendarService.js";
import type { ClassifiedCalendarEvents } from "./calendarEvents.js";
import { classifyGoogleCalendarEvents } from "./calendarEvents.js";
import type { EventRange } from "./eventRanges.js";
import { getGoogleQueryRange } from "./eventRanges.js";

const EVENT_CALENDAR_CONCURRENCY = 4;

export type UserMeetoryCalendar = {
  id: string;
  name: string;
  googleCalendarId: string;
  timeZone: string | null;
};

export type CalendarEventsGroup = {
  calendar: UserMeetoryCalendar;
  events: ClassifiedCalendarEvents;
};

export type CalendarEventsError = {
  calendar: UserMeetoryCalendar;
  kind: GoogleApiErrorKind | "owner_google_unavailable";
};

export type UserCalendarEventsResult = {
  groups: CalendarEventsGroup[];
  errors: CalendarEventsError[];
  totalCalendars: number;
};

export type CollectUserCalendarEventsInput = {
  calendars: UserMeetoryCalendar[];
  range: EventRange;
  now: Date;
  timeZone: string;
  loadEvents: (calendar: UserMeetoryCalendar, query: {
    queryStartIso: string;
    queryEndIso: string;
  }) => Promise<calendar_v3.Schema$Event[]>;
};

function toUserMeetoryCalendar(calendar: Calendar): UserMeetoryCalendar {
  return {
    id: calendar.id,
    name: calendar.name,
    googleCalendarId: calendar.google_calendar_id,
    timeZone: null,
  };
}

function hasAnyEvents(events: ClassifiedCalendarEvents) {
  return events.current.length > 0 || events.possiblyStillInProgress.length > 0;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

export async function getEventsFromUserCalendars(input: {
  userId: string;
  range: EventRange;
  now: Date;
  timeZone: string;
}): Promise<UserCalendarEventsResult> {
  const calendars = (await calendarsRepository.findForUser(input.userId)).map(toUserMeetoryCalendar);

  return collectUserCalendarEvents({
    calendars,
    range: input.range,
    now: input.now,
    timeZone: input.timeZone,
    loadEvents: async (calendar, query) => {
      const response = await getCalendarEvents({
        userId: input.userId,
        calendarId: calendar.id,
        rangeStart: query.queryStartIso,
        rangeEnd: query.queryEndIso,
        timeZone: input.timeZone,
      });

      return response.events;
    },
  });
}

export async function collectUserCalendarEvents(input: CollectUserCalendarEventsInput): Promise<UserCalendarEventsResult> {
  const queryRange = getGoogleQueryRange({
    range: input.range,
    now: input.now,
    timeZone: input.timeZone,
  });
  const results = await mapWithConcurrency(input.calendars, EVENT_CALENDAR_CONCURRENCY, async (calendar) => {
    try {
      const googleEvents = await input.loadEvents(calendar, {
        queryStartIso: queryRange.queryStartIso,
        queryEndIso: queryRange.queryEndIso,
      });
      const events = classifyGoogleCalendarEvents({
        events: googleEvents,
        range: input.range,
        now: input.now,
      });

      return hasAnyEvents(events)
        ? { type: "group" as const, group: { calendar, events } satisfies CalendarEventsGroup }
        : { type: "empty" as const };
    } catch (error) {
      const kind = error instanceof CalendarGoogleConnectionUnavailableError
        ? "owner_google_unavailable"
        : classifyGoogleApiError(error);

      console.error("Calendar events load failed:", {
        operation: "load_calendar_events",
        calendarId: calendar.id,
        googleCalendarId: calendar.googleCalendarId,
        errorKind: kind,
        rangeStart: input.range.rangeStartIso,
        rangeEnd: input.range.rangeEndIso,
        queryStart: queryRange.queryStartIso,
        queryEnd: queryRange.queryEndIso,
      });

      return {
        type: "error" as const,
        error: {
          calendar,
          kind,
        } satisfies CalendarEventsError,
      };
    }
  });

  return {
    groups: results
      .filter((result) => result.type === "group")
      .map((result) => result.group),
    errors: results
      .filter((result) => result.type === "error")
      .map((result) => result.error),
    totalCalendars: input.calendars.length,
  };
}
