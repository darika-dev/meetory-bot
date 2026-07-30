import type { ConfirmEventPayload } from "./eventDraft.js";

export type EventEditField = "title" | "location" | "price" | "description";

export type EditEventFieldPayload = {
  draftId: string;
  field: EventEditField;
};

export function parseEditEventFieldPayload(payload: unknown): EditEventFieldPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const draftId = typeof candidate.draftId === "string" && candidate.draftId ? candidate.draftId : null;
  const field = candidate.field;

  if (!draftId || !isEventEditField(field)) {
    return null;
  }

  return {
    draftId,
    field,
  };
}

export function isEventEditField(value: unknown): value is EventEditField {
  return value === "title"
    || value === "location"
    || value === "price"
    || value === "description";
}

export function updateDraftField(
  draft: ConfirmEventPayload,
  field: EventEditField,
  rawValue: string,
): ConfirmEventPayload {
  const value = rawValue.trim();

  if (field === "title") {
    return { ...draft, title: value };
  }

  if (field === "location") {
    return { ...draft, location: value || null };
  }

  if (field === "price") {
    return { ...draft, price: value || null };
  }

  return { ...draft, sourceDescription: rawValue.trim() || null };
}
