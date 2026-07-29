import type { Language } from "../i18n.js";
import { getEventParserModel, getOpenAIClient } from "./client.js";

export type ParsedEvent = {
  isEvent: boolean;
  scheduleType: "single" | "daily_range" | "all_day_range";
  title: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  eventUrl: string | null;
  locationUrl: string | null;
  sourceUrl: string | null;
  confidence: number;
  missingFields: string[];
};

export type DetectedLink = {
  text: string;
  url: string;
};

export type ParseEventInput = {
  text: string;
  detectedLinks?: DetectedLink[];
  language: Language;
  currentDate: string;
  currentLocalTime: string;
  timeZone: string;
  forwardContext?: string | null;
};

const eventSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    isEvent: { type: "boolean" },
    scheduleType: { type: "string", enum: ["single", "daily_range", "all_day_range"] },
    title: { type: ["string", "null"] },
    startDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    startTime: { type: ["string", "null"], pattern: "^\\d{2}:\\d{2}$" },
    endDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    endTime: { type: ["string", "null"], pattern: "^\\d{2}:\\d{2}$" },
    isAllDay: { type: "boolean" },
    location: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    eventUrl: { type: ["string", "null"] },
    locationUrl: { type: ["string", "null"] },
    sourceUrl: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    missingFields: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "isEvent",
    "scheduleType",
    "title",
    "startDate",
    "startTime",
    "endDate",
    "endTime",
    "isAllDay",
    "location",
    "description",
    "eventUrl",
    "locationUrl",
    "sourceUrl",
    "confidence",
    "missingFields",
  ],
} as const;

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateParsedEvent(value: unknown): ParsedEvent {
  if (typeof value !== "object" || value === null) {
    throw new Error("OpenAI event parser returned non-object output");
  }

  const candidate = value as Record<string, unknown>;

  return {
    isEvent: candidate.isEvent === true,
    scheduleType: candidate.scheduleType === "daily_range"
      ? "daily_range"
      : candidate.scheduleType === "all_day_range"
        ? "all_day_range"
        : "single",
    title: nullableString(candidate.title),
    startDate: nullableString(candidate.startDate),
    startTime: nullableString(candidate.startTime),
    endDate: nullableString(candidate.endDate),
    endTime: nullableString(candidate.endTime),
    isAllDay: candidate.isAllDay === true,
    location: nullableString(candidate.location),
    description: nullableString(candidate.description),
    eventUrl: nullableString(candidate.eventUrl),
    locationUrl: nullableString(candidate.locationUrl),
    sourceUrl: nullableString(candidate.sourceUrl),
    confidence: typeof candidate.confidence === "number"
      ? Math.max(0, Math.min(1, candidate.confidence))
      : 0,
    missingFields: Array.isArray(candidate.missingFields)
      ? candidate.missingFields.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export async function parseEvent(input: ParseEventInput) {
  const response = await getOpenAIClient().responses.create({
    model: getEventParserModel(),
    input: [
      {
        role: "system",
        content: [
          "Extract event details from Russian or English Telegram text.",
          "Return only fields matching the schema.",
          "Do not invent missing title, date, time, location, or URL.",
          "Use YYYY-MM-DD dates and 24-hour HH:mm times.",
          "If time is missing, return null for time fields and set isAllDay=true.",
          "Use scheduleType=single for one ordinary event, including a truly continuous multi-day event.",
          "Use scheduleType=all_day_range for a multi-day date range without a specified time; preserve endDate and set isAllDay=true.",
          "Use scheduleType=daily_range only when the announcement says the event happens on each date in an inclusive date range with the same daily hours.",
          "A date range with opening hours like '31 июля – 2 августа, 18:00–23:00', 'пт–вс 18:00–23:00', 'daily from 18:00 to 23:00', or 'July 31 through August 2, daily from 18:00 to 23:00' is usually scheduleType=daily_range.",
          "For scheduleType=daily_range, preserve endDate, require startTime and endTime when present in the text, and do not represent it as one continuous event.",
          "A date range without daily hours, such as 'Festival July 31 - August 2' with no time, should be scheduleType=all_day_range with isAllDay=true and endDate preserved.",
          "Do not invent scheduleType=daily_range for a real continuous interval like 'Retreat from July 31 at 18:00 until August 2 at 23:00'; that is scheduleType=single.",
          "If the text contains a date range such as '30 июля – 1 августа', endDate must not be null.",
          "Recurring events without an end date are not supported; do not invent an endDate.",
          "Classify URLs into eventUrl, locationUrl, and sourceUrl. eventUrl is the concrete event page, tickets, registration, official announcement, or detailed program. locationUrl is a map link such as Google Maps, Apple Maps, maps.app.goo.gl, mapy.cz, or OpenStreetMap. sourceUrl is an aggregator, Telegram channel, or page where the announcement was reposted.",
          "Google Maps and other map links must never be eventUrl. Footer or generic site links must not replace a concrete eventUrl. Do not invent URLs.",
          "When multiple links exist, prefer eventUrl over locationUrl over sourceUrl, but keep separate URL fields when their purposes differ.",
          "If the message contains annotated hidden links like 'ТУТ [https://example.com]' or 'Cyproplan [https://cyproplan.com]', preserve that label and URL in description when it belongs to the event details.",
          "If a year is missing, use the provided current date and timezone; if the date has passed, consider the next year.",
          "Interpret relative dates using the provided current date, local time, and timezone.",
          "Keep title and description in the source language.",
          "Set isEvent=false when the text is not an event announcement.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `User language: ${input.language}`,
          `Current date: ${input.currentDate}`,
          `Current local time: ${input.currentLocalTime}`,
          `Timezone: ${input.timeZone}`,
          input.forwardContext ? `Forward context: ${input.forwardContext}` : null,
          "",
          "Message:",
          input.text,
          input.detectedLinks && input.detectedLinks.length > 0 ? "\nDetected links:" : null,
          ...(input.detectedLinks ?? []).map((link) => `- ${link.text} -> ${link.url}`),
        ].filter((line): line is string => line !== null).join("\n"),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "meetory_event_parse",
        strict: true,
        schema: eventSchema,
      },
    },
  });

  return validateParsedEvent(JSON.parse(response.output_text));
}
