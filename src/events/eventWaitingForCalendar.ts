import type { DetectedLink } from "../ai/eventParser.js";
import type { ConfirmEventSourceIdentity } from "./eventDraft.js";

export type EventWaitingForCalendarPayload = {
  text: string;
  forwardContext: string | null;
  detectedLinks: DetectedLink[];
  sourceIdentity: ConfirmEventSourceIdentity;
};

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDetectedLinks(value: unknown): DetectedLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const text = normalizeNullableString(candidate.text);
    const url = normalizeNullableString(candidate.url);

    return text && url ? [{ text, url }] : [];
  });
}

function parseSourceIdentity(value: unknown): ConfirmEventSourceIdentity {
  if (typeof value !== "object" || value === null) {
    return {
      chatId: null,
      messageId: null,
      updateId: null,
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    chatId: normalizeNullableString(candidate.chatId),
    messageId: normalizeNullableString(candidate.messageId),
    updateId: normalizeNullableString(candidate.updateId),
  };
}

export function parseEventWaitingForCalendarPayload(payload: unknown): EventWaitingForCalendarPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const text = normalizeNullableString(candidate.text);

  if (!text) {
    return null;
  }

  return {
    text,
    forwardContext: normalizeNullableString(candidate.forwardContext),
    detectedLinks: parseDetectedLinks(candidate.detectedLinks),
    sourceIdentity: parseSourceIdentity(candidate.sourceIdentity),
  };
}
