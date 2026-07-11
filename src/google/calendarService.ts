import { google } from "googleapis";
import { createGoogleOAuthClient } from "./oauth.js";
import type { GoogleConnection } from "../repositories/googleConnections.js";
import * as googleConnectionsRepository from "../repositories/googleConnections.js";
import { decryptToken } from "../security/tokenEncryption.js";

export type CreatedGoogleCalendar = {
  googleCalendarId: string;
  name: string;
  timeZone: string | null;
};

export function buildAuthorizedCalendarClient(connection: GoogleConnection) {
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

export async function deleteCalendarForUser(input: {
  connection: GoogleConnection;
  googleCalendarId: string;
}) {
  const calendar = buildAuthorizedCalendarClient(input.connection);

  await calendar.calendars.delete({
    calendarId: input.googleCalendarId,
  });
}
