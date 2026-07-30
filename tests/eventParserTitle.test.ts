import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTitleFallback,
  buildEventParserSystemPrompt,
  inferNaturalEventTitle,
  type ParsedEvent,
} from "../src/ai/eventParser.js";

function parsedWithoutTitle(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    isEvent: true,
    scheduleType: "single",
    title: null,
    startDate: "2026-08-01",
    startTime: null,
    endDate: null,
    endTime: null,
    isAllDay: true,
    location: null,
    price: null,
    description: null,
    eventUrl: null,
    locationUrl: null,
    sourceUrl: null,
    confidence: 0.8,
    missingFields: ["title"],
    ...overrides,
  };
}

test("prompt asks model to generate a short natural title for clear untitled events", () => {
  const prompt = buildEventParserSystemPrompt();

  assert.match(prompt, /create a short natural title/i);
  assert.match(prompt, /завтра будет фестиваль вишни в Тримиклини/);
  assert.match(prompt, /Фестиваль вишни/);
  assert.doesNotMatch(prompt, /Do not invent missing title/);
});

test("infers title for cherry festival announcement without official name", () => {
  assert.equal(
    inferNaturalEventTitle("завтра будет фестиваль вишни в Тримиклини"),
    "Фестиваль вишни",
  );
});

test("infers title for Imagine Dragons concert", () => {
  assert.equal(inferNaturalEventTitle("концерт Imagine Dragons"), "Концерт Imagine Dragons");
});

test("infers title for wine fair", () => {
  assert.equal(inferNaturalEventTitle("ярмарка вина"), "Ярмарка вина");
});

test("infers title for open-air cinema wording", () => {
  assert.equal(inferNaturalEventTitle("кинопоказ под открытым небом"), "Кинопоказ");
});

test("does not infer title from date-only reminder", () => {
  assert.equal(inferNaturalEventTitle("завтра"), null);
});

test("does not infer title from generic reminder text", () => {
  assert.equal(inferNaturalEventTitle("надо не забыть"), null);
});

test("title fallback fills only clear event titles and removes missing title marker", () => {
  const parsed = applyTitleFallback(
    parsedWithoutTitle(),
    "завтра будет фестиваль вишни в Тримиклини",
  );

  assert.equal(parsed.title, "Фестиваль вишни");
  assert.deepEqual(parsed.missingFields, []);
});

test("title fallback leaves non-event or unclear parsed result unchanged", () => {
  assert.equal(
    applyTitleFallback(parsedWithoutTitle({ isEvent: false }), "завтра будет фестиваль вишни").title,
    null,
  );
  assert.equal(applyTitleFallback(parsedWithoutTitle(), "завтра").title, null);
});
