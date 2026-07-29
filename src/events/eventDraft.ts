import { randomUUID } from "crypto";
import type { ParsedEvent } from "../ai/eventParser.js";

export const CONFIRM_EVENT_PAYLOAD_VERSION = 2;

export type ConfirmEventPayload = {
  payloadVersion: typeof CONFIRM_EVENT_PAYLOAD_VERSION;
  eventTraceId: string;
  draftId: string;
  status?: "ready" | "processing";
  scheduleType: "single" | "daily_range" | "all_day_range";
  title: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  sourceDescription: string | null;
  eventUrl: string | null;
  locationUrl: string | null;
  sourceUrl: string | null;
  calendarId: string;
};

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getScheduleType(value: unknown): ConfirmEventPayload["scheduleType"] {
  if (value === "daily_range" || value === "all_day_range") {
    return value;
  }

  return "single";
}

export function parseConfirmEventPayload(payload: unknown): ConfirmEventPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const title = normalizeNullableString(candidate.title);
  const startDate = normalizeNullableString(candidate.startDate);
  const calendarId = normalizeNullableString(candidate.calendarId);
  const draftId = normalizeNullableString(candidate.draftId);
  const status = candidate.status === "processing" ? "processing" : "ready";
  const payloadVersion = candidate.payloadVersion === CONFIRM_EVENT_PAYLOAD_VERSION
    ? CONFIRM_EVENT_PAYLOAD_VERSION
    : null;
  const eventTraceId = normalizeNullableString(candidate.eventTraceId);

  if (!payloadVersion || !eventTraceId || !draftId || !title || !startDate || !calendarId) {
    return null;
  }

  return {
    payloadVersion,
    eventTraceId,
    draftId,
    status,
    scheduleType: getScheduleType(candidate.scheduleType),
    title,
    startDate,
    startTime: normalizeNullableString(candidate.startTime),
    endDate: normalizeNullableString(candidate.endDate),
    endTime: normalizeNullableString(candidate.endTime),
    isAllDay: candidate.isAllDay === true,
    location: normalizeNullableString(candidate.location),
    description: normalizeNullableString(candidate.description),
    sourceDescription: normalizeNullableString(candidate.sourceDescription),
    eventUrl: normalizeNullableString(candidate.eventUrl),
    locationUrl: normalizeNullableString(candidate.locationUrl),
    sourceUrl: normalizeNullableString(candidate.sourceUrl),
    calendarId,
  };
}

export function buildConfirmEventPayload(
  parsed: ParsedEvent,
  calendarId: string,
  eventTraceId = randomUUID(),
  sourceDescription: string | null = null,
): ConfirmEventPayload {
  return {
    payloadVersion: CONFIRM_EVENT_PAYLOAD_VERSION,
    eventTraceId,
    draftId: randomUUID(),
    status: "ready",
    scheduleType: parsed.scheduleType,
    title: parsed.title ?? "",
    startDate: parsed.startDate ?? "",
    startTime: parsed.startTime,
    endDate: parsed.endDate,
    endTime: parsed.endTime,
    isAllDay: parsed.isAllDay || !parsed.startTime,
    location: parsed.location,
    description: parsed.description,
    sourceDescription,
    eventUrl: parsed.eventUrl,
    locationUrl: parsed.locationUrl,
    sourceUrl: parsed.sourceUrl,
    calendarId,
  } satisfies ConfirmEventPayload;
}
