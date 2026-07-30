import { google, type calendar_v3 } from "googleapis";
import { createGoogleOAuthClient } from "./oauth.js";
import { classifyGoogleApiError, type GoogleApiErrorKind } from "./googleApiErrors.js";
import type { GoogleConnection } from "../repositories/googleConnections.js";
import type { Calendar } from "../repositories/calendars.js";
import { assertCalendarMember } from "../calendars/calendarAccess.js";
import {
  CalendarGoogleConnectionUnavailableError,
  resolveCalendarGoogleConnection,
} from "../calendars/calendarGoogleConnection.js";
import * as calendarsRepository from "../repositories/calendars.js";
import * as googleConnectionsRepository from "../repositories/googleConnections.js";
import { decryptToken } from "../security/tokenEncryption.js";
import {
  addCalendarDays,
  addMinutesToLocalTime,
  buildLocalDateTime,
  normalizeTimedEventEndDate,
} from "./localDateTime.js";
import { appendMeetorySignature } from "./meetorySignature.js";

const DEFAULT_EVENT_DURATION_MINUTES = 60;
const MAX_DAILY_RANGE_DAYS = 31;
export const MEETORY_END_TIME_PROPERTY = "meetoryEndTime";
export const MEETORY_END_TIME_EXPLICIT = "explicit";
export const MEETORY_END_TIME_ESTIMATED = "estimated";
export const INVALID_TIMED_EVENT_DATE_RANGE_ERROR = "invalid_timed_event_date_range";

export type CreatedGoogleCalendar = {
  googleCalendarId: string;
  name: string;
  timeZone: string | null;
};

export type GoogleCalendarMetadata = {
  id: string;
  summary: string;
  description: string | null;
  timeZone: string | null;
  accessRole: string | null;
  primary: boolean;
};

export type CalendarAvailability =
  | {
      status: "available";
      calendar: Calendar;
      metadata: GoogleCalendarMetadata;
    }
  | {
      status: Exclude<GoogleApiErrorKind, "unknown"> | "unknown" | "owner_google_unavailable";
      calendar: Calendar;
    };

export type GoogleEventDraft = {
  eventTraceId?: string;
  draftId?: string;
  scheduleType: "single" | "daily_range" | "all_day_range";
  title: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  isAllDay: boolean;
  location: string | null;
  price: string | null;
  description: string | null;
  sourceDescription?: string | null;
  eventUrl: string | null;
  locationUrl: string | null;
  sourceUrl: string | null;
};

export type CreatedGoogleEvent = {
  id: string | null;
  htmlLink: string | null;
  count: number;
};

export type GoogleCalendarEventListResult = {
  events: calendar_v3.Schema$Event[];
  metadata: GoogleCalendarMetadata;
};

export class GoogleEventBatchPartialFailureError extends Error {
  constructor(
    message: string,
    readonly createdCount: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GoogleEventBatchPartialFailureError";
  }
}

export function buildAuthorizedCalendarClient(connection: GoogleConnection) {
  if (connection.status !== "connected" || !connection.encrypted_refresh_token) {
    throw new Error("Google connection is disconnected");
  }

  const oauth2Client = createGoogleOAuthClient();

  oauth2Client.setCredentials({
    refresh_token: decryptToken(connection.encrypted_refresh_token),
  });

  return google.calendar({
    auth: oauth2Client,
    version: "v3",
  });
}

export async function createCalendarForUser(input: {
  userId: string;
  name: string;
}) {
  const connection = await googleConnectionsRepository.findByUserId(input.userId);

  if (!connection) {
    throw new Error("Google connection not found");
  }

  const calendar = buildAuthorizedCalendarClient(connection);
  const timeZone = await getCalendarListTimeZone(calendar, "primary") ?? "UTC";
  const response = await calendar.calendars.insert({
    requestBody: {
      summary: input.name,
      timeZone,
    },
  });

  if (!response.data.id || !response.data.summary) {
    throw new Error("Google Calendar API did not return a calendar id or summary");
  }

  return {
    connection,
    calendar: {
      googleCalendarId: response.data.id,
      name: response.data.summary,
      timeZone: response.data.timeZone ?? null,
    } satisfies CreatedGoogleCalendar,
  };
}

export async function getCalendarMetadata(calendarRecord: Calendar) {
  return getCalendarMetadataByGoogleId({
    connection: await getCalendarConnection(calendarRecord),
    googleCalendarId: calendarRecord.google_calendar_id,
  });
}

async function getCalendarConnection(calendarRecord: Calendar) {
  return (await resolveCalendarGoogleConnection(calendarRecord.id)).connection;
}

function compareIsoDates(left: string, right: string) {
  return left.localeCompare(right);
}

function getGoogleErrorStatusForLog(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: {
      status?: unknown;
    };
  };
  const status = candidate.response?.status ?? candidate.status ?? candidate.code;

  return typeof status === "number" ? status : null;
}

function getGoogleErrorReasonForLog(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as {
    errors?: Array<{ reason?: unknown }>;
    response?: {
      data?: {
        error?: string | {
          errors?: Array<{ reason?: unknown }>;
          status?: unknown;
        };
      };
    };
  };

  const reasons = [
    ...(candidate.errors ?? []),
    ...(
      typeof candidate.response?.data?.error === "object"
        ? candidate.response.data.error.errors ?? []
        : []
    ),
  ]
    .map((item) => item.reason)
    .filter((reason): reason is string => typeof reason === "string");
  const responseError = candidate.response?.data?.error;

  if (typeof responseError === "string") {
    reasons.push(responseError);
  }

  if (typeof responseError === "object" && typeof responseError.status === "string") {
    reasons.push(responseError.status);
  }

  return reasons.length > 0 ? reasons.map((reason) => reason.toLowerCase()).join(",") : null;
}

export function buildGoogleTimedEventDateRange(input: {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
}) {
  const startDateTime = buildLocalDateTime(input.startDate, input.startTime);
  const endDateTime = buildLocalDateTime(input.endDate, input.endTime);

  if (endDateTime <= startDateTime) {
    throw new Error(INVALID_TIMED_EVENT_DATE_RANGE_ERROR);
  }

  return {
    start: {
      dateTime: startDateTime,
      timeZone: input.timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: input.timeZone,
    },
  };
}

function enumerateInclusiveDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  let current = startDate;

  while (compareIsoDates(current, endDate) <= 0) {
    dates.push(current);

    if (dates.length > MAX_DAILY_RANGE_DAYS) {
      throw new Error("daily_range_too_long");
    }

    current = addCalendarDays(current, 1);
  }

  return dates;
}

export function buildEventDescription(input: GoogleEventDraft) {
  const description = input.sourceDescription?.trim() || input.description?.trim() || null;
  const hasEmbeddedUrl = (url: string | null) => Boolean(url && description?.includes(url));
  const hasEmbeddedPrice = Boolean(input.price && description?.includes(input.price));

  const parts = [
    description,
    input.price && !hasEmbeddedPrice ? `Price:\n${input.price}` : null,
    input.eventUrl && !hasEmbeddedUrl(input.eventUrl) ? `Original event:\n${input.eventUrl}` : null,
    input.locationUrl && !hasEmbeddedUrl(input.locationUrl) ? `Map:\n${input.locationUrl}` : null,
  ].filter((part): part is string => Boolean(part));

  return appendMeetorySignature(parts.join("\n\n"));
}

export function buildBaseEventRequestBody(input: GoogleEventDraft) {
  const meetoryEndTime = input.isAllDay || !input.startTime
    ? null
    : input.endTime
      ? MEETORY_END_TIME_EXPLICIT
      : MEETORY_END_TIME_ESTIMATED;

  return {
    summary: input.title,
    location: input.location ?? undefined,
    description: buildEventDescription(input),
    source: input.eventUrl
      ? {
          title: "Original event",
          url: input.eventUrl,
        }
      : undefined,
    extendedProperties: {
      private: {
        meetory: "true",
        ...(meetoryEndTime ? { [MEETORY_END_TIME_PROPERTY]: meetoryEndTime } : {}),
      },
    },
  } as Record<string, unknown>;
}

function resolveSingleTimedEventEnd(input: GoogleEventDraft) {
  if (!input.startTime) {
    throw new Error("startTime is required for timed event");
  }

  if (input.endTime) {
    const endDate = normalizeTimedEventEndDate({
      startDate: input.startDate,
      startTime: input.startTime,
      endDate: input.endDate,
      endTime: input.endTime,
    }).endDate;

    return {
      endDate,
      endTime: input.endTime,
    };
  }

  return addMinutesToLocalTime(input.startDate, input.startTime, DEFAULT_EVENT_DURATION_MINUTES);
}

export function buildSingleEventRequestBody(input: GoogleEventDraft, timeZone: string | null) {
  const requestBody = buildBaseEventRequestBody(input);

  if (input.isAllDay || !input.startTime) {
    requestBody.start = {
      date: input.startDate,
    };
    requestBody.end = {
      date: addCalendarDays(input.endDate ?? input.startDate, 1),
    };

    return requestBody;
  }

  if (!timeZone) {
    throw new Error("Google Calendar API did not return calendar timezone");
  }

  const end = resolveSingleTimedEventEnd(input);
  const dateRange = buildGoogleTimedEventDateRange({
    startDate: input.startDate,
    startTime: input.startTime,
    endDate: end.endDate ?? input.startDate,
    endTime: end.endTime,
    timeZone,
  });

  requestBody.start = dateRange.start;
  requestBody.end = dateRange.end;

  return requestBody;
}

export function buildDailyRangeEventRequestBodies(input: GoogleEventDraft, timeZone: string | null) {
  if (!input.endDate || !input.startTime || !input.endTime) {
    throw new Error("invalid_daily_range");
  }

  if (compareIsoDates(input.endDate, input.startDate) < 0) {
    throw new Error("invalid_daily_range");
  }

  if (!timeZone) {
    throw new Error("Google Calendar API did not return calendar timezone");
  }

  const startTime = input.startTime;
  const endTime = input.endTime;

  return enumerateInclusiveDates(input.startDate, input.endDate).map((date) => {
    const endDate = endTime <= startTime ? addCalendarDays(date, 1) : date;
    const requestBody = buildBaseEventRequestBody(input);
    const dateRange = buildGoogleTimedEventDateRange({
      startDate: date,
      startTime,
      endDate,
      endTime,
      timeZone,
    });

    requestBody.start = dateRange.start;
    requestBody.end = dateRange.end;

    return requestBody;
  });
}

export function buildGoogleEventRequestBodies(input: GoogleEventDraft, timeZone: string | null) {
  return input.scheduleType === "daily_range"
    ? buildDailyRangeEventRequestBodies(input, timeZone)
    : [buildSingleEventRequestBody(input, timeZone)];
}

function getDateTimeForLog(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as { dateTime?: unknown };

  return typeof candidate.dateTime === "string" ? candidate.dateTime : null;
}

function getTimeZoneForLog(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as { timeZone?: unknown };

  return typeof candidate.timeZone === "string" ? candidate.timeZone : null;
}

function containsTimeZoneOffset(value: string | null) {
  return /[+-]\d{2}:\d{2}$/.test(value ?? "");
}

function logGoogleEventRequest(input: {
  draft: GoogleEventDraft;
  calendarTimeZone: string | null;
  calendarMetadataTimeZone: string | null;
  fallbackWasUsed: boolean;
  requestBody: Record<string, unknown>;
}) {
  const googleStartDateTime = getDateTimeForLog(input.requestBody.start);
  const googleEndDateTime = getDateTimeForLog(input.requestBody.end);

  console.info("[event-time:google-request]", {
    traceId: input.draft.eventTraceId ?? null,
    scheduleType: input.draft.scheduleType,
    calendarTimeZone: input.calendarTimeZone,
    calendarMetadataTimeZone: input.calendarMetadataTimeZone,
    fallbackWasUsed: input.fallbackWasUsed,
    parsedStartDate: input.draft.startDate,
    parsedStartTime: input.draft.startTime,
    parsedEndDate: input.draft.endDate,
    parsedEndTime: input.draft.endTime,
    startDateTime: googleStartDateTime,
    startTimeZone: getTimeZoneForLog(input.requestBody.start),
    endDateTime: googleEndDateTime,
    endTimeZone: getTimeZoneForLog(input.requestBody.end),
    startContainsZ: googleStartDateTime?.includes("Z") ?? false,
    endContainsZ: googleEndDateTime?.includes("Z") ?? false,
    startContainsOffset: containsTimeZoneOffset(googleStartDateTime),
    endContainsOffset: containsTimeZoneOffset(googleEndDateTime),
  });
}

function logGoogleEventResponse(responseData: {
  traceId?: string | null;
  start?: unknown;
  end?: unknown;
}) {
  console.info("[event-time:google-response]", {
    traceId: responseData.traceId ?? null,
    responseStartDateTime: getDateTimeForLog(responseData.start),
    responseStartTimeZone: getTimeZoneForLog(responseData.start),
    responseEndDateTime: getDateTimeForLog(responseData.end),
    responseEndTimeZone: getTimeZoneForLog(responseData.end),
  });
}

export async function getCalendarMetadataByGoogleId(input: {
  connection: GoogleConnection;
  googleCalendarId: string;
}) {
  const calendar = buildAuthorizedCalendarClient(input.connection);
  const response = await calendar.calendars.get({
    calendarId: input.googleCalendarId,
  });

  if (!response.data.id || !response.data.summary) {
    throw new Error("Google Calendar API did not return calendar metadata");
  }

  return {
    id: response.data.id,
    summary: response.data.summary,
    description: response.data.description ?? null,
    timeZone: response.data.timeZone ?? (await getCalendarListTimeZone(calendar, input.googleCalendarId)),
    accessRole: null,
    primary: false,
  } satisfies GoogleCalendarMetadata;
}

async function getCalendarListTimeZone(
  calendar: ReturnType<typeof buildAuthorizedCalendarClient>,
  googleCalendarId: string,
) {
  const response = await calendar.calendarList.get({
    calendarId: googleCalendarId,
  });

  return response.data.timeZone ?? null;
}

export async function getGoogleAccountTimeZoneForUser(userId: string) {
  const connection = await googleConnectionsRepository.findByUserId(userId);

  if (!connection) {
    return null;
  }

  const calendar = buildAuthorizedCalendarClient(connection);

  return getCalendarListTimeZone(calendar, "primary");
}

async function resolveEventTimeZone(input: {
  calendar: ReturnType<typeof buildAuthorizedCalendarClient>;
  metadata: GoogleCalendarMetadata;
}) {
  if (input.metadata.timeZone && input.metadata.timeZone !== "UTC") {
    return {
      timeZone: input.metadata.timeZone,
      fallbackWasUsed: false,
    };
  }

  const primaryTimeZone = await getCalendarListTimeZone(input.calendar, "primary");

  if (primaryTimeZone && primaryTimeZone !== input.metadata.timeZone) {
    console.info("[google-calendar:event-timezone]", {
      calendarMetadataTimeZone: input.metadata.timeZone,
      effectiveEventTimeZone: primaryTimeZone,
      source: "primary_calendar",
    });

    return {
      timeZone: primaryTimeZone,
      fallbackWasUsed: true,
    };
  }

  return {
    timeZone: input.metadata.timeZone ?? primaryTimeZone ?? null,
    fallbackWasUsed: !input.metadata.timeZone && Boolean(primaryTimeZone),
  };
}

export async function getCalendarListMetadataByGoogleId(input: {
  connection: GoogleConnection;
  googleCalendarId: string;
}) {
  const calendar = buildAuthorizedCalendarClient(input.connection);
  const response = await calendar.calendarList.get({
    calendarId: input.googleCalendarId,
  });

  return {
    id: response.data.id ?? input.googleCalendarId,
    summary: response.data.summary ?? "",
    description: response.data.description ?? null,
    timeZone: response.data.timeZone ?? null,
    accessRole: response.data.accessRole ?? null,
    primary: response.data.primary === true,
  } satisfies GoogleCalendarMetadata;
}

export async function checkCalendarAvailability(calendarRecord: Calendar): Promise<CalendarAvailability> {
  try {
    return {
      status: "available",
      calendar: calendarRecord,
      metadata: await getCalendarMetadata(calendarRecord),
    };
  } catch (error) {
    if (error instanceof CalendarGoogleConnectionUnavailableError) {
      return {
        status: "owner_google_unavailable",
        calendar: calendarRecord,
      };
    }

    return {
      status: classifyGoogleApiError(error),
      calendar: calendarRecord,
    };
  }
}

export async function listMeetoryCalendarsForUser(userId: string) {
  const calendars = await calendarsRepository.findForUser(userId);

  return Promise.all(calendars.map((calendar) => checkCalendarAvailability(calendar)));
}

export async function cleanupDeletedCalendar(calendarRecord: Calendar) {
  await calendarsRepository.cleanupDeletedCalendarById(calendarRecord.id);
}

export async function deleteGoogleCalendar(input: {
  connection: GoogleConnection;
  googleCalendarId: string;
}) {
  const calendar = buildAuthorizedCalendarClient(input.connection);

  await calendar.calendars.delete({
    calendarId: input.googleCalendarId,
  });
}

export async function deleteRegistryGoogleCalendar(calendarRecord: Calendar) {
  const connection = await getCalendarConnection(calendarRecord);
  const metadata = await getCalendarListMetadataByGoogleId({
    connection,
    googleCalendarId: calendarRecord.google_calendar_id,
  });

  if (metadata.primary) {
    throw new Error("primary_google_calendar");
  }

  await deleteGoogleCalendar({
    connection,
    googleCalendarId: calendarRecord.google_calendar_id,
  });
}

export async function deleteCalendarForUser(input: {
  connection: GoogleConnection;
  googleCalendarId: string;
}) {
  return deleteGoogleCalendar(input);
}

export async function renameGoogleCalendar(input: {
  calendarRecord: Calendar;
  name: string;
}) {
  const calendar = buildAuthorizedCalendarClient(await getCalendarConnection(input.calendarRecord));
  const response = await calendar.calendars.patch({
    calendarId: input.calendarRecord.google_calendar_id,
    requestBody: {
      summary: input.name,
    },
  });

  if (!response.data.id || !response.data.summary) {
    throw new Error("Google Calendar API did not return renamed calendar metadata");
  }

  return {
    id: response.data.id,
    summary: response.data.summary,
    description: response.data.description ?? null,
    timeZone: response.data.timeZone ?? null,
    accessRole: null,
    primary: false,
  } satisfies GoogleCalendarMetadata;
}

export async function createGoogleCalendarEvent(input: {
  userId: string;
  calendarId: string;
  draft: GoogleEventDraft;
}) {
  await assertCalendarMember(input.calendarId, input.userId);
  const {
    calendar: calendarRecord,
    connection,
    ownerUserId,
  } = await resolveCalendarGoogleConnection(input.calendarId);
  const metadata = await getCalendarMetadataByGoogleId({
    connection,
    googleCalendarId: calendarRecord.google_calendar_id,
  });
  const calendar = buildAuthorizedCalendarClient(connection);
  const resolvedTimeZone = await resolveEventTimeZone({
    calendar,
    metadata,
  });
  const timeZone = resolvedTimeZone.timeZone;

  console.info("[event-time:calendar]", {
    traceId: input.draft.eventTraceId ?? null,
    calendarId: input.calendarId,
    calendarTimeZone: timeZone,
    calendarMetadataTimeZone: metadata.timeZone,
    fallbackWasUsed: resolvedTimeZone.fallbackWasUsed,
  });

  const createdEvents: CreatedGoogleEvent[] = [];

  try {
    const requestBodies = buildGoogleEventRequestBodies(input.draft, timeZone);

    for (const requestBody of requestBodies) {
      logGoogleEventRequest({
        draft: input.draft,
        calendarTimeZone: timeZone,
        calendarMetadataTimeZone: metadata.timeZone,
        fallbackWasUsed: resolvedTimeZone.fallbackWasUsed,
        requestBody,
      });

      const response = await calendar.events.insert({
        calendarId: calendarRecord.google_calendar_id,
        requestBody,
      });

      if (calendarRecord.created_by_user_id !== input.userId) {
        console.info("[shared-calendar:event-created]", {
          userId: input.userId,
          calendarId: calendarRecord.id,
          ownerUserId,
          googleCalendarId: calendarRecord.google_calendar_id,
          traceId: input.draft.eventTraceId ?? null,
        });
      }

      const createdEvent = response.data.id
        ? await calendar.events.get({
            calendarId: calendarRecord.google_calendar_id,
            eventId: response.data.id,
            timeZone: timeZone ?? undefined,
          })
        : response;

      logGoogleEventResponse({
        traceId: input.draft.eventTraceId ?? null,
        start: createdEvent.data.start,
        end: createdEvent.data.end,
      });

      createdEvents.push({
        id: response.data.id ?? null,
        htmlLink: response.data.htmlLink ?? null,
        count: 1,
      });
    }
  } catch (error) {
    console.error("[event-time:google-create-failed]", {
      operation: "create_event",
      calendarId: calendarRecord.id,
      googleCalendarId: calendarRecord.google_calendar_id,
      draftId: input.draft.draftId ?? null,
      startDate: input.draft.startDate,
      startTime: input.draft.startTime,
      endDate: input.draft.endDate,
      endTime: input.draft.endTime,
      timezone: timeZone,
      googleStatus: classifyGoogleApiError(error),
      googleErrorCode: getGoogleErrorStatusForLog(error),
      googleErrorReason: getGoogleErrorReasonForLog(error),
    });

    let rollbackFailed = false;

    for (const createdEvent of createdEvents) {
      if (!createdEvent.id) {
        continue;
      }

      try {
        await calendar.events.delete({
          calendarId: calendarRecord.google_calendar_id,
          eventId: createdEvent.id,
        });
      } catch {
        rollbackFailed = true;
      }
    }

    if (rollbackFailed) {
      throw new GoogleEventBatchPartialFailureError(
        "Google Calendar event batch rollback failed",
        createdEvents.length,
        error,
      );
    }

    throw error;
  }

  return {
    id: createdEvents[0]?.id ?? null,
    htmlLink: createdEvents[0]?.htmlLink ?? null,
    count: createdEvents.length,
  } satisfies CreatedGoogleEvent;
}

export async function getCalendarEvents(input: {
  userId: string;
  calendarId: string;
  rangeStart: string;
  rangeEnd: string;
  timeZone: string;
}) {
  await assertCalendarMember(input.calendarId, input.userId);
  const {
    calendar: calendarRecord,
    connection,
  } = await resolveCalendarGoogleConnection(input.calendarId);
  const metadata = await getCalendarMetadataByGoogleId({
    connection,
    googleCalendarId: calendarRecord.google_calendar_id,
  });
  const calendar = buildAuthorizedCalendarClient(connection);
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId: calendarRecord.google_calendar_id,
      timeMin: input.rangeStart,
      timeMax: input.rangeEnd,
      singleEvents: true,
      orderBy: "startTime",
      showDeleted: false,
      timeZone: input.timeZone,
      pageToken,
    });

    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return {
    events,
    metadata,
  };
}
