import type { GoogleConnection } from "../repositories/googleConnections.js";
import type { Calendar } from "../repositories/calendars.js";
import * as calendarsRepository from "../repositories/calendars.js";
import * as googleConnectionsRepository from "../repositories/googleConnections.js";

export class CalendarGoogleConnectionUnavailableError extends Error {
  constructor(readonly calendarId: string, readonly ownerUserId: string) {
    super("calendar_owner_google_connection_unavailable");
    this.name = "CalendarGoogleConnectionUnavailableError";
  }
}

export type ResolvedCalendarGoogleConnection = {
  calendar: Calendar;
  connection: GoogleConnection;
  ownerUserId: string;
};

function isUsableConnection(connection: GoogleConnection | null): connection is GoogleConnection {
  return Boolean(
    connection
    && connection.status === "connected"
    && connection.encrypted_refresh_token,
  );
}

export async function resolveCalendarGoogleConnection(calendarId: string): Promise<ResolvedCalendarGoogleConnection> {
  const calendar = await calendarsRepository.findById(calendarId);

  if (!calendar) {
    throw new Error("calendar_not_found");
  }

  const storedConnection = calendar.google_connection_id
    ? await googleConnectionsRepository.findById(calendar.google_connection_id)
    : null;
  const ownerConnection = isUsableConnection(storedConnection)
    ? storedConnection
    : await googleConnectionsRepository.findByUserId(calendar.created_by_user_id);

  if (!isUsableConnection(ownerConnection)) {
    console.warn("[shared-calendar:owner-google-unavailable]", {
      calendarId: calendar.id,
      ownerUserId: calendar.created_by_user_id,
      hasStoredConnectionId: Boolean(calendar.google_connection_id),
      storedConnectionStatus: storedConnection?.status ?? null,
    });

    throw new CalendarGoogleConnectionUnavailableError(calendar.id, calendar.created_by_user_id);
  }

  return {
    calendar,
    connection: ownerConnection,
    ownerUserId: calendar.created_by_user_id,
  };
}
