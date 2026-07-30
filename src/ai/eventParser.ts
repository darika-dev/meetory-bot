import type { Language } from "../i18n/index.js";
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
  price: string | null;
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
  traceId?: string | null;
};

export type EventParseFailureCategory =
  | "provider_error"
  | "invalid_model_output"
  | "unsupported_or_missing_event_data"
  | "internal_error";

export type EventParseStage =
  | "prepare"
  | "request"
  | "response"
  | "json_parse"
  | "normalize"
  | "title_fallback"
  | "repair";

export class EventParseError extends Error {
  readonly category: EventParseFailureCategory;
  readonly stage: EventParseStage;
  readonly issues: string[];
  readonly providerRequestId: string | null;

  constructor(input: {
    message: string;
    category: EventParseFailureCategory;
    stage: EventParseStage;
    issues?: string[];
    providerRequestId?: string | null;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "EventParseError";
    this.category = input.category;
    this.stage = input.stage;
    this.issues = input.issues ?? [];
    this.providerRequestId = input.providerRequestId ?? null;
    if (input.cause !== undefined) {
      (this as { cause?: unknown }).cause = input.cause;
    }
  }
}

const titleCategoryPatterns = [
  {
    pattern: /(?:^|\s)фестиваль\s+([^,\n.]+?)(?=\s+(?:в|во|на|под|около|у)\s|$|[,.\n])/i,
    label: "Фестиваль",
  },
  {
    pattern: /(?:^|\s)ярмарка\s+([^,\n.]+?)(?=\s+(?:в|во|на|под|около|у)\s|$|[,.\n])/i,
    label: "Ярмарка",
  },
  {
    pattern: /(?:^|\s)концерт\s+([^,\n.]+?)(?=\s+(?:в|во|на|под|около|у)\s|$|[,.\n])/i,
    label: "Концерт",
  },
  {
    pattern: /(?:^|\s)выставка\s+([^,\n.]+?)(?=\s+(?:в|во|на|под|около|у)\s|$|[,.\n])/i,
    label: "Выставка",
  },
] as const;

function normalizeTitleTail(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[,:;.]+$/g, "")
    .trim();
}

function hasDateOrTimeCue(text: string) {
  return /(\b\d{1,2}:\d{2}\b)|(\b\d{1,2}\s+[A-Za-zА-Яа-яЁё]{3,}\b)|(\b(?:сегодня|завтра|послезавтра|today|tomorrow|tonight|this weekend|weekend)\b)/i.test(text);
}

function looksLikeNaturalTitle(value: string) {
  const normalized = normalizeTitleTail(value);

  if (!normalized || normalized.length < 3) {
    return false;
  }

  if (!/[\p{L}\p{N}]/u.test(normalized)) {
    return false;
  }

  if (/^\d/.test(normalized)) {
    return false;
  }

  if (/^(?:завтра|сегодня|послезавтра|today|tomorrow|tonight|ок|надо не забыть)$/i.test(normalized)) {
    return false;
  }

  return true;
}

function capitalizeFirst(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

export function inferNaturalEventTitle(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  for (const { pattern, label } of titleCategoryPatterns) {
    const match = normalizedText.match(pattern);
    const tail = normalizeTitleTail(match?.[1] ?? "");

    if (tail) {
      return `${label} ${tail}`;
    }
  }

  if (/(?:^|\s)(?:ночной\s+)?кинопоказ(?:\s|$|[,.\n])/i.test(normalizedText)) {
    return "Кинопоказ";
  }

  if (/\bopen[-\s]?air\s+cinema\b/i.test(normalizedText)) {
    return "Open-air cinema";
  }

  const englishMatch = normalizedText.match(/\b(festival|fair|concert|exhibition)\s+([^,\n.]+?)(?=\s+(?:in|at|on|near|by)\s|$|[,.\n])/i);
  if (englishMatch?.[1] && englishMatch[2]) {
    return `${capitalizeFirst(englishMatch[1].toLowerCase())} ${normalizeTitleTail(englishMatch[2])}`;
  }

  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const leadLine = lines[0] ?? null;
  const hasTemporalCue = hasDateOrTimeCue(lines.join(" ")) || lines.slice(1).some(hasDateOrTimeCue);

  if (leadLine && hasTemporalCue) {
    const candidate = normalizeTitleTail(leadLine.split(/[,:;—–-]/)[0] ?? "");

    if (looksLikeNaturalTitle(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function applyTitleFallback(parsed: ParsedEvent, text: string): ParsedEvent {
  if (!parsed.isEvent || parsed.title) {
    return parsed;
  }

  const title = inferNaturalEventTitle(text);

  if (!title) {
    return parsed;
  }

  return {
    ...parsed,
    title,
    missingFields: parsed.missingFields.filter((field) => field !== "title"),
  };
}

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
    price: { type: ["string", "null"] },
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
    "price",
    "description",
    "eventUrl",
    "locationUrl",
    "sourceUrl",
    "confidence",
    "missingFields",
  ],
} as const;

export function buildEventParserSystemPrompt() {
  return [
    "Extract event details from Russian or English Telegram text.",
    "Return only fields matching the schema.",
    "Do not invent missing date, time, location, price, or URL.",
    "If the text clearly describes an event but does not provide an official event name, create a short natural title from the event type and subject instead of leaving title null.",
    "Examples: 'завтра будет фестиваль вишни в Тримиклини' -> title='Фестиваль вишни'; 'ярмарка вина в Лимассоле' -> title='Ярмарка вина'; 'концерт Imagine Dragons' -> title='Концерт Imagine Dragons'; 'ночной кинопоказ на пляже' -> title='Кинопоказ'; 'выставка современного искусства' -> title='Выставка современного искусства'.",
    "Return title=null only when the message is not enough to understand what event the user wants to save, such as 'завтра', 'надо не забыть', or 'ок'.",
    "Extract price only if it is explicitly present, preserving source wording such as Free, €10, Donation, or от €15.",
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
  ].join(" ");
}

function shouldLogEventParserDebug() {
  return process.env.MEETORY_DEBUG_EVENT_PARSER === "1";
}

function logEventParserDebug(label: string, value: unknown) {
  if (!shouldLogEventParserDebug()) {
    return;
  }

  console.debug(`[event-parser:debug:${label}]`, value);
}

function logEventParserStage(input: {
  stage: EventParseStage;
  traceId?: string | null;
  repairAttempted?: boolean;
  providerRequestId?: string | null;
  category?: EventParseFailureCategory;
  issues?: string[];
  textLength?: number;
  lineCount?: number;
  linkCount?: number;
}) {
  console.info("[event-parser:stage]", {
    stage: input.stage,
    traceId: input.traceId ?? null,
    repairAttempted: input.repairAttempted ?? false,
    providerRequestId: input.providerRequestId ?? null,
    category: input.category ?? null,
    issues: input.issues ?? [],
    textLength: input.textLength ?? null,
    lineCount: input.lineCount ?? null,
    linkCount: input.linkCount ?? null,
  });
}

export function coerceParsedEventCandidate(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : value;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.event && typeof candidate.event === "object" && candidate.event !== null) {
    return candidate.event;
  }

  if (Array.isArray(candidate.events) && candidate.events.length === 1) {
    return candidate.events[0];
  }

  return value;
}

function getValidationIssues(parsed: ParsedEvent) {
  const issues: string[] = [];

  if (!parsed.isEvent) {
    issues.push("isEvent=false");
  }

  if (!parsed.title) {
    issues.push("title");
  }

  if (!parsed.startDate) {
    issues.push("startDate");
  }

  if (!parsed.startTime && !parsed.isAllDay) {
    issues.push("startTime");
  }

  return issues;
}

function normalizeParsedEventCandidate(value: unknown, inputText: string) {
  const candidate = coerceParsedEventCandidate(value);

  if (typeof candidate !== "object" || candidate === null) {
    throw new EventParseError({
      message: "OpenAI event parser returned non-object output",
      category: "invalid_model_output",
      stage: "json_parse",
      issues: ["non_object"],
    });
  }

  const parsed = applyTitleFallback(validateParsedEvent(candidate), inputText);
  const issues = getValidationIssues(parsed);

  if (issues.length > 0) {
    throw new EventParseError({
      message: "OpenAI event parser returned incomplete event data",
      category: "unsupported_or_missing_event_data",
      stage: "normalize",
      issues,
    });
  }

  return parsed;
}

function buildRepairPrompt(input: ParseEventInput, issueSummary: string) {
  return [
    "Return a single JSON object matching the schema.",
    "Do not wrap the answer in markdown, code fences, or prose.",
    "Do not invent end time when it is not in the message.",
    `Repair issues: ${issueSummary}.`,
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
  ].filter((line): line is string => line !== null).join("\n");
}

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
    price: nullableString(candidate.price),
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
  const userInput = [
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
  ].filter((line): line is string => line !== null).join("\n");

  logEventParserStage({
    stage: "prepare",
    traceId: input.traceId,
    textLength: input.text.length,
    lineCount: input.text.split(/\r?\n/).length,
    linkCount: input.detectedLinks?.length ?? 0,
  });
  logEventParserDebug("input", userInput);

  async function requestParse(systemPrompt: string, repairAttempted: boolean) {
    logEventParserStage({
      stage: "request",
      traceId: input.traceId,
      repairAttempted,
    });

    return getOpenAIClient().responses.create({
      model: getEventParserModel(),
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userInput,
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
  }

  try {
    const response = await requestParse(buildEventParserSystemPrompt(), false);

    logEventParserStage({
      stage: "response",
      traceId: input.traceId,
      providerRequestId: response.id ?? null,
    });
    logEventParserDebug("raw-response", response.output_text);

    try {
      const parsed = normalizeParsedEventCandidate(JSON.parse(response.output_text), input.text);

      logEventParserStage({
        stage: "normalize",
        traceId: input.traceId,
        providerRequestId: response.id ?? null,
      });
      logEventParserDebug("validated-result", parsed);

      return parsed;
    } catch (error) {
      const issues = error instanceof EventParseError ? error.issues : ["json_parse"];
      const category = error instanceof EventParseError ? error.category : "invalid_model_output";

      logEventParserStage({
        stage: "repair",
        traceId: input.traceId,
        providerRequestId: response.id ?? null,
        category,
        issues,
        repairAttempted: true,
      });

      const repairResponse = await requestParse(buildRepairPrompt(input, issues.join(", ")), true);

      logEventParserStage({
        stage: "response",
        traceId: input.traceId,
        providerRequestId: repairResponse.id ?? null,
        repairAttempted: true,
      });
      logEventParserDebug("raw-response-repair", repairResponse.output_text);

      try {
        const repaired = normalizeParsedEventCandidate(JSON.parse(repairResponse.output_text), input.text);

        logEventParserStage({
          stage: "normalize",
          traceId: input.traceId,
          providerRequestId: repairResponse.id ?? null,
          repairAttempted: true,
        });
        logEventParserDebug("validated-result-repair", repaired);

        return repaired;
      } catch (repairError) {
        throw repairError instanceof EventParseError
          ? repairError
          : new EventParseError({
              message: "Event parser repair attempt returned invalid output",
              category: "invalid_model_output",
              stage: "repair",
              issues,
              providerRequestId: repairResponse.id ?? null,
              cause: repairError,
            });
      }
    }
  } catch (error) {
    if (error instanceof EventParseError) {
      throw error;
    }

    throw error instanceof Error
      ? error
      : new EventParseError({
          message: "Unexpected event parser failure",
          category: "internal_error",
          stage: "request",
          cause: error,
        });
  }
}
