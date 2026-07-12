import { google } from "googleapis";
import { createGoogleOAuthClient } from "./oauth.js";
import { classifyGoogleApiError, type GoogleApiErrorKind } from "./googleApiErrors.js";
import type { GoogleConnection } from "../repositories/googleConnections.js";
import type { Calendar } from "../repositories/calendars.js";
import * as calendarsRepository from "../repositories/calendars.js";
import * as googleConnectionsRepository from "../repositories/googleConnections.js";
import { decryptToken } from "../security/tokenEncryption.js";

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
};

export type CalendarAvailability =
  | {
      status: "available";
      calendar: Calendar;
      metadata: GoogleCalendarMetadata;
    }
  | {
      status: Exclude<GoogleApiErrorKind, "unknown"> | "unknown";
      calendar: Calendar;
    };

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
  const response = await calendar.calendars.insert({
    requestBody: {
      summary: input.name,
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
  const connection = calendarRecord.google_connection_id
    ? await googleConnectionsRepository.findById(calendarRecord.google_connection_id)
    : await googleConnectionsRepository.findByUserId(calendarRecord.created_by_user_id);

  if (!connection) {
    throw new Error("Google connection not found");
  }

  return getCalendarMetadataByGoogleId({
    connection,
    googleCalendarId: calendarRecord.google_calendar_id,
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
    timeZone: response.data.timeZone ?? null,
    accessRole: null,
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

export async function deleteCalendarForUser(input: {
  connection: GoogleConnection;
  googleCalendarId: string;
}) {
  return deleteGoogleCalendar(input);
}

export async function renameGoogleCalendar(input: {
  connection: GoogleConnection;
  googleCalendarId: string;
  name: string;
}) {
  const calendar = buildAuthorizedCalendarClient(input.connection);
  const response = await calendar.calendars.patch({
    calendarId: input.googleCalendarId,
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
  } satisfies GoogleCalendarMetadata;
}
